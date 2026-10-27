import { Lift, Piste } from '../models/ski-resort.model';

export type SkillLevel = 'all' | 'noblack' | 'easy';

export interface RoutingOptions {
    level?: SkillLevel;
    fastLifts?: boolean;
    badWeather?: boolean;
}

export interface RouteLeg {
    kind: 'run' | 'lift' | 'walk';
    name: string;
    difficulty?: string;
    liftType?: string;
    distanceMeters: number;
    durationSeconds: number;
    ascentMeters: number;
    descentMeters: number;
    instruction: string;
    coordinates: [number, number][];
}

export interface RouteResult {
    success: boolean;
    originName: string;
    destinationName: string;
    totalDistanceMeters: number;
    totalDurationSeconds: number;
    totalAscentMeters: number;
    totalDescentMeters: number;
    pistesCount: number;
    liftsCount: number;
    legs: RouteLeg[];
    fullCoordinates: [number, number][];
    difficultyBreakdown: {
        novice: number;
        easy: number;
        intermediate: number;
        advanced: number;
    };
    levelRelaxed?: boolean;
    error?: string;
}

export type ElevationProvider = (coord: [number, number]) => number | null;

// Speeds in meters per second
const RUN_SPEED: Record<string, number> = {
    novice: 5,        // 18 km/h
    easy: 7,          // 25 km/h
    intermediate: 8,  // 29 km/h
    advanced: 7,      // 25 km/h
    expert: 6,        // 22 km/h
    freeride: 5,
    other: 6,
};

const LIFT_SPEED: Record<string, number> = {
    gondola: 5,
    cable_car: 8,
    funicular: 6,
    railway: 6,
    mixed_lift: 5,
    chair_lift: 3.2,
    drag_lift: 3.0,
    't-bar': 3.0,
    platter: 3.0,
    'j-bar': 3.0,
    rope_tow: 2.0,
    magic_carpet: 1.0,
};

const LIFT_WAIT = 60;       // seconds wait at base station
const WALK_SPEED = 1.1;     // m/s on snow with equipment

// Robust connection distances in meters (calibrated to real-world OSM ski resorts)
const MAX_PISTE_TO_LIFT_M = 350;     // Piste bottom to lift base station across snow front / resort base
const MAX_PISTE_MID_TO_LIFT_M = 150; // Mid-piste node to lift base station
const MAX_LIFT_TO_PISTE_M = 280;     // Lift top station to piste head
const MAX_LIFT_TO_PISTE_MID_M = 180; // Lift top station to any downstream piste node
const MAX_LIFT_TO_LIFT_M = 350;      // Lift top to next lift base (hub/station transfer)
const MAX_BASE_TO_BASE_M = 400;      // Lift base to another lift base (transferring at resort base / valley)
const MAX_RIDGE_TRANSFER_M = 150;    // Lift top to lift top walking transfer
const MAX_PISTE_TO_PISTE_M = 180;    // Piste bottom to next piste head
const MAX_PISTE_MERGE_M = 120;       // Piste bottom merging into any node of another piste
const MAX_PISTE_JUNCTION_M = 50;     // Direct intersection/fork between two pistes
const MAX_SNAP_DIST_M = 250;        // Initial radius to snap GPS/tap to a piste/lift

const EASY_LEVEL: Record<string, boolean> = { novice: true, easy: true, other: true };
const NO_BLACK_LEVEL: Record<string, boolean> = { novice: true, easy: true, intermediate: true, other: true };

interface GraphNode {
    p: [number, number, number]; // lon, lat, elevation
    featureIndex: number;
    nodeLocalIndex: number;
}

interface GraphEdge {
    to: number;
    weight: number; // seconds
    featureIndex: number; // -1 for walking / transfer connection
    distance: number;
    intermediateCoords?: [number, number][];
}

interface FeatureMeta {
    kind: 'run' | 'lift';
    piste?: Piste;
    lift?: Lift;
    diff: string;
    liftType?: string;
    name: string;
    topNode: number;
    bottomNode: number;
    nodeIndices: number[];
    coordinates: [number, number, number][];
    startElev?: number;
    endElev?: number;
}

interface SkiNetwork {
    nodes: GraphNode[];
    adj: GraphEdge[][];
    features: FeatureMeta[];
}

// Distance in meters between [lon, lat] points
export const calculateDistanceM = (a: [number, number] | number[], b: [number, number] | number[]): number => {
    const k = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
    return Math.hypot((a[0] - b[0]) * 111320 * k, (a[1] - b[1]) * 111320);
};

export class SkiRoutingEngine {
    private network: SkiNetwork;
    private rawPistes: Piste[];
    private rawLifts: Lift[];

    constructor(
        pistes: Piste[] = [],
        lifts: Lift[] = [],
        elevationProvider?: ElevationProvider
    ) {
        this.rawPistes = pistes;
        this.rawLifts = lifts;
        this.network = this.buildNetwork(pistes, lifts, elevationProvider);
    }

    private getPisteElevation(
        piste: Piste,
        coords: [number, number][],
        elevProvider?: ElevationProvider,
        liftBases?: [number, number][],
        liftSummits?: [number, number][]
    ): { startElev: number | null; endElev: number | null } {
        // 1. Check 3D coordinates directly on the current geometry (most authoritative)
        const coords3D = piste.GeometryGeoJSON?.coordinates;
        if (coords3D && coords3D.length >= 2) {
            const cFirst = coords3D[0];
            const cLast = coords3D[coords3D.length - 1];
            const e1 = Number(cFirst?.[2]);
            const e2 = Number(cLast?.[2]);
            if (!isNaN(e1) && !isNaN(e2) && e1 > 0 && e2 > 0 && Math.abs(e1 - e2) > 1.5) {
                return { startElev: e1, endElev: e2 };
            }
        }

        // 2. Check elevation provider (DEM)
        if (elevProvider && coords.length >= 2) {
            const e1 = elevProvider(coords[0]);
            const e2 = elevProvider(coords[coords.length - 1]);
            if (e1 !== null && e2 !== null && !isNaN(e1) && !isNaN(e2) && Math.abs(e1 - e2) > 1.5) {
                return { startElev: e1, endElev: e2 };
            }
        }

        // 3. Topological lift proximity inference:
        // Lifts always transport uphill (Base -> Summit).
        if (liftBases && liftSummits && coords.length >= 2 && liftBases.length > 0 && liftSummits.length > 0) {
            const c0 = coords[0];
            const c1 = coords[coords.length - 1];

            const minBaseDist0 = Math.min(...liftBases.map((b) => calculateDistanceM(c0, b)));
            const minSummitDist0 = Math.min(...liftSummits.map((s) => calculateDistanceM(c0, s)));
            const minBaseDist1 = Math.min(...liftBases.map((b) => calculateDistanceM(c1, b)));
            const minSummitDist1 = Math.min(...liftSummits.map((s) => calculateDistanceM(c1, s)));

            // If c0 is near a lift base and c1 is near a lift summit:
            // c0 is base (low), c1 is summit (high) => uphill!
            if (minBaseDist0 < 140 && minSummitDist1 < 160 && minSummitDist0 > minBaseDist0) {
                return { startElev: 1000, endElev: 2000 };
            }
            // If c0 is near a lift summit and c1 is near a lift base:
            // c0 is summit (high), c1 is base (low) => downhill!
            if (minSummitDist0 < 160 && minBaseDist1 < 140 && minBaseDist0 > minSummitDist0) {
                return { startElev: 2000, endElev: 1000 };
            }
        }

        // 4. Check elevationProfile heights in tags
        const hs = piste.Tags?.elevationProfile?.heights;
        if (Array.isArray(hs) && hs.length >= 2) {
            const first = Number(hs[0]);
            const last = Number(hs[hs.length - 1]);
            if (!isNaN(first) && !isNaN(last) && Math.abs(first - last) > 1.5) {
                return { startElev: first, endElev: last };
            }
        }

        return { startElev: null, endElev: null };
    }

    private getLiftElevation(
        lift: Lift,
        coords: [number, number][],
        elevProvider?: ElevationProvider
    ): { startElev: number | null; endElev: number | null } {
        const cFirst = lift.GeometryGeoJSON?.coordinates?.[0];
        const cLast = lift.GeometryGeoJSON?.coordinates?.[lift.GeometryGeoJSON.coordinates.length - 1];
        if (cFirst && cLast && cFirst.length >= 3 && cLast.length >= 3) {
            const e1 = Number(cFirst[2]);
            const e2 = Number(cLast[2]);
            if (!isNaN(e1) && !isNaN(e2) && e1 > 0 && e2 > 0 && Math.abs(e1 - e2) > 1.5) {
                return { startElev: e1, endElev: e2 };
            }
        }
        if (elevProvider && coords.length >= 2) {
            const e1 = elevProvider(coords[0]);
            const e2 = elevProvider(coords[coords.length - 1]);
            if (e1 !== null && e2 !== null && !isNaN(e1) && !isNaN(e2) && Math.abs(e1 - e2) > 1.5) {
                return { startElev: e1, endElev: e2 };
            }
        }
        return { startElev: null, endElev: null };
    }

    private buildNetwork(
        pistes: Piste[],
        lifts: Lift[],
        elevationProvider?: ElevationProvider
    ): SkiNetwork {
        const nodes: GraphNode[] = [];
        const adj: GraphEdge[][] = [];
        const features: FeatureMeta[] = [];

        const addNode = (p: [number, number, number], featIdx: number, localIdx: number): number => {
            nodes.push({ p, featureIndex: featIdx, nodeLocalIndex: localIdx });
            adj.push([]);
            return nodes.length - 1;
        };

        const addEdge = (
            from: number,
            to: number,
            weight: number,
            featIdx: number,
            distance: number,
            intermediateCoords?: [number, number][]
        ) => {
            adj[from].push({ to, weight, featureIndex: featIdx, distance, intermediateCoords });
        };

        // Extract lift base and summit coordinates for topological piste orientation
        const liftBases: [number, number][] = [];
        const liftSummits: [number, number][] = [];

        lifts.forEach((lift) => {
            const raw = lift.GeometryGeoJSON?.coordinates;
            if (raw && raw.length >= 2) {
                const flat = raw.map((c) => [c[0], c[1]] as [number, number]);
                const { startElev, endElev } = this.getLiftElevation(lift, flat, elevationProvider);
                if (startElev !== null && endElev !== null && startElev > endElev + 1.5) {
                    liftBases.push(flat[flat.length - 1]);
                    liftSummits.push(flat[0]);
                } else {
                    liftBases.push(flat[0]);
                    liftSummits.push(flat[flat.length - 1]);
                }
            }
        });

        // 1. Process Pistes (Strictly Downhill Flow)
        pistes.forEach((piste) => {
            const rawCoords = piste.GeometryGeoJSON?.coordinates;
            if (!rawCoords || rawCoords.length < 2) return;

            const flatCoords = rawCoords.map((c) => [c[0], c[1]] as [number, number]);
            const { startElev, endElev } = this.getPisteElevation(
                piste,
                flatCoords,
                elevationProvider,
                liftBases,
                liftSummits
            );

            let pts = rawCoords.map((c) => [c[0], c[1], c[2] ?? 0] as [number, number, number]);

            // If start elevation is lower than end elevation, it was drawn uphill in OSM.
            // Reverse so index 0 is at summit and last index is at base.
            if (startElev !== null && endElev !== null && endElev > startElev + 1.5) {
                pts = [...pts].reverse();
            }

            const diff = (piste.Difficulty || 'easy').toLowerCase();
            const featIdx = features.length;
            const nodeIndices: number[] = [];

            const speed = RUN_SPEED[diff] || RUN_SPEED.other;
            let prevNode: number | null = null;
            let firstNode = -1;

            pts.forEach((pt, idx) => {
                const n = addNode(pt, featIdx, idx);
                nodeIndices.push(n);
                if (idx === 0) firstNode = n;
                if (prevNode !== null) {
                    const dist = calculateDistanceM(nodes[prevNode].p, pt);
                    const baseWeight = Math.max(1, dist / speed);

                    // Check elevation gain on this segment (e.g. slight flat or DEM artifact)
                    const elevGain =
                        pt[2] > 0 && nodes[prevNode].p[2] > 0
                            ? pt[2] - nodes[prevNode].p[2]
                            : 0;

                    // CRITICAL: NEVER drop an edge between consecutive nodes of a designated piste.
                    // If there is an uphill hump (> 2.5m), add walking/skating penalty, but keep the trail intact!
                    const uphillPenalty = elevGain > 2.5 ? (elevGain * 4) + (dist / WALK_SPEED) : 0;
                    addEdge(prevNode, n, baseWeight + uphillPenalty, featIdx, dist, [
                        [nodes[prevNode].p[0], nodes[prevNode].p[1]],
                        [pt[0], pt[1]],
                    ]);
                }
                prevNode = n;
            });

            features.push({
                kind: 'run',
                piste,
                diff,
                name: piste.Name || `Pista ${diff}`,
                topNode: firstNode,
                bottomNode: prevNode ?? firstNode,
                nodeIndices,
                coordinates: pts,
                startElev: startElev ?? undefined,
                endElev: endElev ?? undefined,
            });
        });

        // 2. Process Lifts (Uphill by default, plus bi-directional downhill for enclosed cabins)
        lifts.forEach((lift) => {
            const rawCoords = lift.GeometryGeoJSON?.coordinates;
            if (!rawCoords || rawCoords.length < 2) return;

            const flatCoords = rawCoords.map((c) => [c[0], c[1]] as [number, number]);
            const { startElev, endElev } = this.getLiftElevation(lift, flatCoords, elevationProvider);

            let pts = rawCoords.map((c) => [c[0], c[1], c[2] ?? 0] as [number, number, number]);

            // Lifts MUST transport passengers UPHILL (base to summit).
            // If start elevation is higher than end elevation, reverse so pts[0] is bottom station.
            if (startElev !== null && endElev !== null && startElev > endElev + 1.5) {
                pts = [...pts].reverse();
            }

            const liftType = (lift.LiftType || 'chair_lift').toLowerCase();
            const featIdx = features.length;
            const speed = LIFT_SPEED[liftType] || 3.0;

            let totalLiftDist = 0;
            for (let i = 1; i < pts.length; i++) {
                totalLiftDist += calculateDistanceM(pts[i - 1], pts[i]);
            }
            const rideTime = Math.max(30, totalLiftDist / speed);

            const bottom = addNode(pts[0], featIdx, 0);
            const top = addNode(pts[pts.length - 1], featIdx, pts.length - 1);
            const fullLiftCoords = pts.map((p) => [p[0], p[1]] as [number, number]);

            // Uphill edge: bottom -> top
            addEdge(bottom, top, rideTime + LIFT_WAIT, featIdx, totalLiftDist, fullLiftCoords);

            // Bi-directional transport: gondolas, cable cars, funiculars also carry passengers downhill
            const isEnclosed =
                liftType === 'gondola' ||
                liftType === 'cable_car' ||
                liftType === 'funicular' ||
                liftType === 'railway' ||
                liftType === 'mixed_lift';

            if (isEnclosed) {
                const reversedLiftCoords = [...fullLiftCoords].reverse();
                addEdge(top, bottom, rideTime + LIFT_WAIT + 15, featIdx, totalLiftDist, reversedLiftCoords);
            }

            features.push({
                kind: 'lift',
                lift,
                liftType,
                diff: 'lift',
                name: lift.Name || 'Remonte',
                bottomNode: bottom,
                topNode: top,
                nodeIndices: [bottom, top],
                coordinates: pts,
                startElev: startElev ?? undefined,
                endElev: endElev ?? undefined,
            });
        });

        // 3. Connect Stations & Pistes (Dense, highly connected network topology)
        const pisteFeatures = features.filter((f) => f.kind === 'run');
        const liftFeatures = features.filter((f) => f.kind === 'lift');

        // Rule 3A: Piste bottom -> Lift base station (Skiing into lift queue / snow front)
        pisteFeatures.forEach((pf) => {
            const pBottom = nodes[pf.bottomNode];
            liftFeatures.forEach((lf) => {
                const lBottom = nodes[lf.bottomNode];
                const d = calculateDistanceM(pBottom.p, lBottom.p);
                if (d <= MAX_PISTE_TO_LIFT_M) {
                    const isNear = d <= 80;
                    const walkTime = isNear ? Math.max(4, d / 3.0 + 5) : Math.max(10, d / WALK_SPEED + 15);
                    addEdge(pf.bottomNode, lf.bottomNode, walkTime, -1, d, [
                        [pBottom.p[0], pBottom.p[1]],
                        [lBottom.p[0], lBottom.p[1]],
                    ]);
                }
            });
        });

        // Rule 3B: Lift top station -> Piste head AND any intermediate node along piste
        // (Ensures skiers can enter a piste that originates near the top or passes by the summit station)
        liftFeatures.forEach((lf) => {
            const lTop = nodes[lf.topNode];
            pisteFeatures.forEach((pf) => {
                // Connect to piste head (topNode)
                const pTop = nodes[pf.topNode];
                const dHead = calculateDistanceM(lTop.p, pTop.p);
                if (dHead <= MAX_LIFT_TO_PISTE_M) {
                    const slideTime = Math.max(4, dHead / 3.0 + 8);
                    addEdge(lf.topNode, pf.topNode, slideTime, -1, dHead, [
                        [lTop.p[0], lTop.p[1]],
                        [pTop.p[0], pTop.p[1]],
                    ]);
                }

                // Also connect to any intermediate node within MAX_LIFT_TO_PISTE_MID_M
                pf.nodeIndices.forEach((nIdx) => {
                    if (nIdx === pf.topNode) return;
                    const pNode = nodes[nIdx];
                    const dMid = calculateDistanceM(lTop.p, pNode.p);
                    if (dMid <= MAX_LIFT_TO_PISTE_MID_M) {
                        // Avoid climbing uphill by more than 3m
                        if (lTop.p[2] > 0 && pNode.p[2] > 0 && pNode.p[2] > lTop.p[2] + 3) return;
                        const slideTime = Math.max(4, dMid / 3.0 + 10);
                        addEdge(lf.topNode, nIdx, slideTime, -1, dMid, [
                            [lTop.p[0], lTop.p[1]],
                            [pNode.p[0], pNode.p[1]],
                        ]);
                    }
                });
            });
        });

        // Rule 3C: Lift top station -> Another lift base station (Mid-station hubs / transfers)
        liftFeatures.forEach((lf1) => {
            const l1Top = nodes[lf1.topNode];
            liftFeatures.forEach((lf2) => {
                if (lf1 === lf2) return;
                const l2Bottom = nodes[lf2.bottomNode];
                const d = calculateDistanceM(l1Top.p, l2Bottom.p);
                if (d <= MAX_LIFT_TO_LIFT_M) {
                    const transferTime = Math.max(8, d / WALK_SPEED + 15);
                    addEdge(lf1.topNode, lf2.bottomNode, transferTime, -1, d, [
                        [l1Top.p[0], l1Top.p[1]],
                        [l2Bottom.p[0], l2Bottom.p[1]],
                    ]);
                }
            });
        });

        // Rule 3D: Lift base station <-> Another lift base station (Resort Base / Valley Floor Hubs)
        // CRITICAL: Allows skiing to base of sector 1 and transferring to lift of sector 2
        liftFeatures.forEach((lf1, i) => {
            const l1Bottom = nodes[lf1.bottomNode];
            for (let j = i + 1; j < liftFeatures.length; j++) {
                const lf2 = liftFeatures[j];
                const l2Bottom = nodes[lf2.bottomNode];
                const d = calculateDistanceM(l1Bottom.p, l2Bottom.p);
                if (d <= MAX_BASE_TO_BASE_M) {
                    const walkTime = Math.max(10, d / WALK_SPEED + 20);
                    addEdge(lf1.bottomNode, lf2.bottomNode, walkTime, -1, d, [
                        [l1Bottom.p[0], l1Bottom.p[1]],
                        [l2Bottom.p[0], l2Bottom.p[1]],
                    ]);
                    addEdge(lf2.bottomNode, lf1.bottomNode, walkTime, -1, d, [
                        [l2Bottom.p[0], l2Bottom.p[1]],
                        [l1Bottom.p[0], l1Bottom.p[1]],
                    ]);
                }
            }
        });

        // Rule 3E: Lift top station <-> Another lift top station (Ridge / Summit plateau transfers)
        liftFeatures.forEach((lf1, i) => {
            const l1Top = nodes[lf1.topNode];
            for (let j = i + 1; j < liftFeatures.length; j++) {
                const lf2 = liftFeatures[j];
                const l2Top = nodes[lf2.topNode];
                const d = calculateDistanceM(l1Top.p, l2Top.p);
                if (d <= MAX_RIDGE_TRANSFER_M) {
                    const walkTime = Math.max(12, d / WALK_SPEED + 20);
                    addEdge(lf1.topNode, lf2.topNode, walkTime, -1, d, [
                        [l1Top.p[0], l1Top.p[1]],
                        [l2Top.p[0], l2Top.p[1]],
                    ]);
                    addEdge(lf2.topNode, lf1.topNode, walkTime, -1, d, [
                        [l2Top.p[0], l2Top.p[1]],
                        [l1Top.p[0], l1Top.p[1]],
                    ]);
                }
            }
        });

        // Rule 3F: Piste bottom -> Next Piste start AND Piste bottom -> Mid-piste merge
        pisteFeatures.forEach((pf1) => {
            const p1Bottom = nodes[pf1.bottomNode];
            pisteFeatures.forEach((pf2) => {
                if (pf1 === pf2) return;
                // Piste 1 end to Piste 2 head
                const p2Top = nodes[pf2.topNode];
                const dHead = calculateDistanceM(p1Bottom.p, p2Top.p);
                if (dHead <= MAX_PISTE_TO_PISTE_M) {
                    if (!(p1Bottom.p[2] > 0 && p2Top.p[2] > 0 && p2Top.p[2] > p1Bottom.p[2] + 3)) {
                        const glideTime = Math.max(3, dHead / 4.0);
                        addEdge(pf1.bottomNode, pf2.topNode, glideTime, -1, dHead, [
                            [p1Bottom.p[0], p1Bottom.p[1]],
                            [p2Top.p[0], p2Top.p[1]],
                        ]);
                    }
                }
                // Piste 1 end merging into any node of Piste 2
                pf2.nodeIndices.forEach((nIdx) => {
                    if (nIdx === pf2.topNode) return;
                    const p2Node = nodes[nIdx];
                    const dMerge = calculateDistanceM(p1Bottom.p, p2Node.p);
                    if (dMerge <= MAX_PISTE_MERGE_M) {
                        if (!(p1Bottom.p[2] > 0 && p2Node.p[2] > 0 && p2Node.p[2] > p1Bottom.p[2] + 3)) {
                            const glideTime = Math.max(3, dMerge / 4.0 + 5);
                            addEdge(pf1.bottomNode, nIdx, glideTime, -1, dMerge, [
                                [p1Bottom.p[0], p1Bottom.p[1]],
                                [p2Node.p[0], p2Node.p[1]],
                            ]);
                        }
                    }
                });
            });
        });

        // Rule 3G: Mid-piste intersections / forks (spatial hash grid)
        const G = 300;
        const grid: Record<string, number[]> = {};
        pisteFeatures.forEach((pf) => {
            pf.nodeIndices.forEach((nIdx) => {
                const n = nodes[nIdx];
                const k = `${Math.floor(n.p[0] * G)}:${Math.floor(n.p[1] * G)}`;
                if (!grid[k]) grid[k] = [];
                grid[k].push(nIdx);
            });
        });

        pisteFeatures.forEach((pf1) => {
            pf1.nodeIndices.forEach((n1Idx) => {
                const n1 = nodes[n1Idx];
                const gx = Math.floor(n1.p[0] * G);
                const gy = Math.floor(n1.p[1] * G);

                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        const cellKey = `${gx + dx}:${gy + dy}`;
                        const candidates = grid[cellKey] || [];
                        candidates.forEach((n2Idx) => {
                            const n2 = nodes[n2Idx];
                            if (n1.featureIndex === n2.featureIndex) return;

                            const d = calculateDistanceM(n1.p, n2.p);
                            if (d <= MAX_PISTE_JUNCTION_M) {
                                if (n1.p[2] > 0 && n2.p[2] > 0 && n2.p[2] > n1.p[2] + 2.5) {
                                    return;
                                }
                                addEdge(n1Idx, n2Idx, Math.max(2, d / 4.5), -1, d, [
                                    [n1.p[0], n1.p[1]],
                                    [n2.p[0], n2.p[1]],
                                ]);
                            }
                        });
                    }
                }
            });
        });

        // Rule 3H: Mid-piste points passing near a lift base station
        pisteFeatures.forEach((pf) => {
            const count = pf.nodeIndices.length;
            const checkStartIndex = Math.floor(count * 0.2);
            for (let idx = checkStartIndex; idx < count; idx++) {
                const nIdx = pf.nodeIndices[idx];
                const pNode = nodes[nIdx];
                liftFeatures.forEach((lf) => {
                    const lBottom = nodes[lf.bottomNode];
                    const d = calculateDistanceM(pNode.p, lBottom.p);
                    if (d <= MAX_PISTE_MID_TO_LIFT_M) {
                        const walkTime = Math.max(5, d / WALK_SPEED + 10);
                        addEdge(nIdx, lf.bottomNode, walkTime, -1, d, [
                            [pNode.p[0], pNode.p[1]],
                            [lBottom.p[0], lBottom.p[1]],
                        ]);
                    }
                });
            }
        });

        return { nodes, adj, features };
    }

    public findNearestNodeOnPiste(pisteId: string, coord: [number, number]): number | null {
        const feats = this.network.features.filter((f) => f.kind === 'run' && f.piste?.ID === pisteId);
        if (feats.length === 0) return null;

        let bestNode: number | null = null;
        let minD = Infinity;

        feats.forEach((f) => {
            f.nodeIndices.forEach((nIdx) => {
                const n = this.network.nodes[nIdx];
                const d = calculateDistanceM(coord, n.p);
                if (d < minD) {
                    minD = d;
                    bestNode = nIdx;
                }
            });
        });

        return bestNode;
    }

    public findNearestNodeOnLift(liftId: string, coord?: [number, number]): number | null {
        const feat = this.network.features.find((f) => f.kind === 'lift' && f.lift?.ID === liftId);
        if (!feat) return null;
        if (coord) {
            const dBottom = calculateDistanceM(coord, this.network.nodes[feat.bottomNode].p);
            const dTop = calculateDistanceM(coord, this.network.nodes[feat.topNode].p);
            return dTop < dBottom ? feat.topNode : feat.bottomNode;
        }
        return feat.bottomNode;
    }

    public calculateRoute(
        originCoord: [number, number],
        destPiste: Piste,
        destCoord?: [number, number],
        levelOrOptions: SkillLevel | RoutingOptions = 'all',
        originPiste?: Piste,
        originLift?: Lift,
        elevationProvider?: ElevationProvider
    ): RouteResult {
        const options: RoutingOptions =
            typeof levelOrOptions === 'string'
                ? { level: levelOrOptions }
                : (levelOrOptions || { level: 'all' });
        const level: SkillLevel = options.level || 'all';

        // Rebuild network if elevationProvider is supplied and not used previously
        if (elevationProvider && this.rawPistes.length > 0) {
            this.network = this.buildNetwork(this.rawPistes, this.rawLifts, elevationProvider);
        }

        const emptyResult = (error: string): RouteResult => ({
            success: false,
            originName: originPiste?.Name || originLift?.Name || 'Origen',
            destinationName: destPiste.Name || 'Destino',
            totalDistanceMeters: 0,
            totalDurationSeconds: 0,
            totalAscentMeters: 0,
            totalDescentMeters: 0,
            pistesCount: 0,
            liftsCount: 0,
            legs: [],
            fullCoordinates: [],
            difficultyBreakdown: { novice: 0, easy: 0, intermediate: 0, advanced: 0 },
            error,
        });

        if (this.network.nodes.length === 0) {
            return emptyResult('no_network_available');
        }

        // Safe origin coordinate check
        let safeOriginCoord: [number, number] = originCoord;
        if (!safeOriginCoord || isNaN(safeOriginCoord[0]) || isNaN(safeOriginCoord[1]) || (Math.abs(safeOriginCoord[0]) < 0.001 && Math.abs(safeOriginCoord[1]) < 0.001)) {
            if (originPiste?.GeometryGeoJSON?.coordinates?.[0]) {
                const c = originPiste.GeometryGeoJSON.coordinates[0];
                safeOriginCoord = [c[0], c[1]];
            } else if (originLift?.GeometryGeoJSON?.coordinates?.[0]) {
                const c = originLift.GeometryGeoJSON.coordinates[0];
                safeOriginCoord = [c[0], c[1]];
            } else if (this.network.nodes.length > 0) {
                safeOriginCoord = [this.network.nodes[0].p[0], this.network.nodes[0].p[1]];
            }
        }

        // 1. Identify Start Candidate Nodes
        const startCandidates: { node: number; cost: number; distance: number }[] = [];
        const seenStartNodes = new Set<number>();

        const addStartCandidate = (nodeIdx: number, distM: number, bonusCost: number = 0) => {
            if (seenStartNodes.has(nodeIdx)) return;
            seenStartNodes.add(nodeIdx);
            startCandidates.push({
                node: nodeIdx,
                distance: distM,
                cost: distM / WALK_SPEED + bonusCost,
            });
        };

        if (originPiste) {
            const n = this.findNearestNodeOnPiste(originPiste.ID, safeOriginCoord);
            if (n !== null) {
                addStartCandidate(n, 0, 0);
            }
        }

        if (originLift) {
            const feat = this.network.features.find((f) => f.kind === 'lift' && f.lift?.ID === originLift.ID);
            if (feat) {
                const dBottom = calculateDistanceM(safeOriginCoord, this.network.nodes[feat.bottomNode].p);
                const dTop = calculateDistanceM(safeOriginCoord, this.network.nodes[feat.topNode].p);
                if (dTop < dBottom) {
                    addStartCandidate(feat.topNode, dTop, 0);
                } else {
                    addStartCandidate(feat.bottomNode, dBottom, 0);
                }
            }
        }

        // Search nearby accessible nodes around safeOriginCoord to guarantee robust entry points
        const snapRadii = [MAX_SNAP_DIST_M, 500, 1000];
        for (const radius of snapRadii) {
            if (startCandidates.length > 0) break;
            this.network.nodes.forEach((n, idx) => {
                const d = calculateDistanceM(safeOriginCoord, n.p);
                if (d <= radius) {
                    const isLiftBase = this.network.features[n.featureIndex]?.kind === 'lift' && n.nodeLocalIndex === 0;
                    addStartCandidate(idx, d, isLiftBase ? 0 : 5);
                }
            });
        }

        // If coordinates are far outside, find closest 5 nodes in the whole resort
        if (startCandidates.length === 0) {
            const allSorted = this.network.nodes
                .map((n, idx) => ({ idx, d: calculateDistanceM(safeOriginCoord, n.p) }))
                .sort((a, b) => a.d - b.d);
            allSorted.slice(0, 5).forEach((item) => {
                addStartCandidate(item.idx, item.d, 10);
            });
        }

        if (startCandidates.length === 0) {
            return emptyResult('no_start_point_nearby');
        }

        // 2. Identify Target Feature(s) on Destination Piste
        const destFeats = this.network.features.filter((f) => f.kind === 'run' && f.piste?.ID === destPiste.ID);
        const validDestFeats = destFeats.length > 0
            ? destFeats
            : this.network.features.filter((f) => f.kind === 'run' && f.name.toLowerCase() === (destPiste.Name || '').toLowerCase());
        const finalDestFeats = validDestFeats.length > 0
            ? validDestFeats
            : this.network.features.filter((f) => f.kind === 'run');

        if (finalDestFeats.length === 0) {
            return emptyResult('no_dest_point_nearby');
        }

        const primaryTargets = new Set<number>();
        let targetSpecificNode: number | null = null;
        let targetPisteFeat: FeatureMeta = finalDestFeats[0];

        if (destCoord) {
            let minD = Infinity;
            finalDestFeats.forEach((f) => {
                f.nodeIndices.forEach((nIdx) => {
                    const d = calculateDistanceM(destCoord, this.network.nodes[nIdx].p);
                    if (d < minD) {
                        minD = d;
                        targetSpecificNode = nIdx;
                        targetPisteFeat = f;
                    }
                });
            });
            if (targetSpecificNode !== null) {
                primaryTargets.add(targetSpecificNode);
            }
        }

        // If no destCoord, target the head (topNode) of the destination piste
        if (primaryTargets.size === 0) {
            finalDestFeats.forEach((f) => primaryTargets.add(f.topNode));
        }

        // Secondary / broad target set (all nodes of destination piste)
        const allDestPisteNodes = new Set<number>();
        finalDestFeats.forEach((f) => {
            f.nodeIndices.forEach((nIdx) => allDestPisteNodes.add(nIdx));
        });

        // 3. Special Case: Same Piste and Start is strictly upstream of Target
        if (originPiste && (originPiste.ID === destPiste.ID || (targetSpecificNode !== null && this.network.nodes[startCandidates[0].node].featureIndex === this.network.nodes[targetSpecificNode].featureIndex))) {
            const startNode = startCandidates[0].node;
            const startFeatIdx = this.network.nodes[startNode].featureIndex;
            const feat = this.network.features[startFeatIdx];
            if (feat && feat.kind === 'run') {
                const startLocalIdx = this.network.nodes[startNode].nodeLocalIndex;
                const targetNode = targetSpecificNode !== null ? targetSpecificNode : feat.bottomNode;
                const targetLocalIdx = this.network.nodes[targetNode].nodeLocalIndex;

                if (startLocalIdx < targetLocalIdx) {
                    // Straightforward downhill run on this piste
                    const sliceCoords = feat.coordinates
                        .slice(startLocalIdx, targetLocalIdx + 1)
                        .map((c) => [c[0], c[1]] as [number, number]);

                    let dist = 0;
                    for (let i = 1; i < sliceCoords.length; i++) {
                        dist += calculateDistanceM(sliceCoords[i - 1], sliceCoords[i]);
                    }
                    const speed = RUN_SPEED[feat.diff] || RUN_SPEED.other;
                    const duration = Math.max(20, Math.round(dist / speed));
                    const descent = Math.max(0, Math.round(feat.coordinates[startLocalIdx][2] - feat.coordinates[targetLocalIdx][2]));

                    const leg: RouteLeg = {
                        kind: 'run',
                        name: feat.name,
                        difficulty: feat.diff,
                        distanceMeters: Math.round(dist),
                        durationSeconds: duration,
                        ascentMeters: 0,
                        descentMeters: descent,
                        instruction: `Descenso por pista ${feat.name}`,
                        coordinates: sliceCoords,
                    };

                    return {
                        success: true,
                        originName: originPiste.Name || 'Pista de inicio',
                        destinationName: destPiste.Name || 'Destino',
                        totalDistanceMeters: Math.round(dist),
                        totalDurationSeconds: duration,
                        totalAscentMeters: 0,
                        totalDescentMeters: descent,
                        pistesCount: 1,
                        liftsCount: 0,
                        legs: [leg],
                        fullCoordinates: sliceCoords,
                        difficultyBreakdown: {
                            novice: feat.diff === 'novice' ? 100 : 0,
                            easy: feat.diff === 'easy' ? 100 : 0,
                            intermediate: feat.diff === 'intermediate' ? 100 : 0,
                            advanced: ['advanced', 'expert'].includes(feat.diff) ? 100 : 0,
                        },
                    };
                }
            }
        }

        // 4. Multi-Tier Dijkstra Search Engine
        const solveDijkstra = (
            targets: Set<number>,
            skillFilter: SkillLevel,
            relaxSkillLevel: boolean,
            opts: RoutingOptions,
            extraEdges?: Map<number, GraphEdge[]>
        ): { endNode: number; best: Float64Array; from: Int32Array; viaEdge: Array<GraphEdge | null> } => {
            const numNodes = this.network.nodes.length;
            const best = new Float64Array(numNodes).fill(Infinity);
            const from = new Int32Array(numNodes).fill(-1);
            const viaEdge = new Array<GraphEdge | null>(numNodes).fill(null);

            const heap: [number, number][] = [];
            const push = (cost: number, node: number) => {
                heap.push([cost, node]);
                let k = heap.length - 1;
                while (k > 0) {
                    const p = (k - 1) >> 1;
                    if (heap[p][0] <= heap[k][0]) break;
                    const tmp = heap[p];
                    heap[p] = heap[k];
                    heap[k] = tmp;
                    k = p;
                }
            };

            const pop = (): [number, number] | undefined => {
                const top = heap[0];
                const last = heap.pop();
                if (heap.length && last) {
                    heap[0] = last;
                    let k = 0;
                    while (true) {
                        const l = 2 * k + 1;
                        const r = l + 1;
                        let m = k;
                        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
                        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
                        if (m === k) break;
                        const tmp = heap[m];
                        heap[m] = heap[k];
                        heap[k] = tmp;
                        k = m;
                    }
                }
                return top;
            };

            startCandidates.forEach((sc) => {
                if (sc.cost < best[sc.node]) {
                    best[sc.node] = sc.cost;
                    push(sc.cost, sc.node);
                }
            });

            let reachedEndNode = -1;

            while (heap.length > 0) {
                const current = pop();
                if (!current) break;
                const [c, u] = current;
                if (c > best[u]) continue;

                if (targets.has(u)) {
                    reachedEndNode = u;
                    break;
                }

                const edges = this.network.adj[u] || [];
                const allEdges = extraEdges && extraEdges.has(u)
                    ? [...edges, ...extraEdges.get(u)!]
                    : edges;

                for (let i = 0; i < allEdges.length; i++) {
                    const e = allEdges[i];
                    let edgeWeight = e.weight;

                    if (e.featureIndex >= 0) {
                        const feat = this.network.features[e.featureIndex];
                        if (feat) {
                            if (feat.kind === 'run') {
                                if (!relaxSkillLevel) {
                                    if (skillFilter === 'easy' && !EASY_LEVEL[feat.diff]) continue;
                                    if (skillFilter === 'noblack' && !NO_BLACK_LEVEL[feat.diff]) continue;
                                } else {
                                    // Soft penalty so easier paths are strongly prioritized over harder ones
                                    if (skillFilter === 'easy') {
                                        if (feat.diff === 'intermediate') edgeWeight += 500;
                                        else if (feat.diff === 'advanced' || feat.diff === 'expert') edgeWeight += 2000;
                                    } else if (skillFilter === 'noblack') {
                                        if (feat.diff === 'advanced' || feat.diff === 'expert') edgeWeight += 1200;
                                    }
                                }

                                if (opts.fastLifts && (feat.diff === 'novice' || feat.diff === 'easy')) {
                                    edgeWeight *= 1.15;
                                }
                            } else if (feat.kind === 'lift') {
                                const lType = feat.liftType || 'chair_lift';
                                if (opts.fastLifts) {
                                    if (lType === 'gondola' || lType === 'cable_car' || lType === 'funicular') {
                                        edgeWeight *= 0.6;
                                    } else if (lType.includes('drag') || lType.includes('t-bar') || lType.includes('platter')) {
                                        edgeWeight *= 2.5;
                                    } else if (lType === 'magic_carpet') {
                                        edgeWeight *= 4.0;
                                    }
                                }
                                if (opts.badWeather) {
                                    if (lType === 'chair_lift') {
                                        edgeWeight *= 2.2;
                                    } else if (lType.includes('drag') || lType.includes('t-bar')) {
                                        edgeWeight *= 2.0;
                                    } else if (lType === 'gondola' || lType === 'cable_car' || lType === 'funicular') {
                                        edgeWeight *= 0.5;
                                    }
                                }
                            }
                        }
                    }

                    const nextCost = c + edgeWeight;
                    if (nextCost < best[e.to]) {
                        best[e.to] = nextCost;
                        from[e.to] = u;
                        viaEdge[e.to] = e;
                        push(nextCost, e.to);
                    }
                }
            }

            return { endNode: reachedEndNode, best, from, viaEdge };
        };

        // Execution of Multi-Tier Search:
        let levelRelaxed = false;

        // Tier 1: User preferences + primary target
        let solution = solveDijkstra(primaryTargets, level, false, options);


        // Tier 2: User preferences + any node on destination piste
        if (solution.endNode < 0 && allDestPisteNodes.size > 0) {
            solution = solveDijkstra(allDestPisteNodes, level, false, options);
        }

        // Tier 3: Relax skill level filter (bridges across harder slopes with penalties)
        if (solution.endNode < 0 && level !== 'all') {
            levelRelaxed = true;
            solution = solveDijkstra(primaryTargets, level, true, options);
            if (solution.endNode < 0 && allDestPisteNodes.size > 0) {
                solution = solveDijkstra(allDestPisteNodes, level, true, options);
            }
        }

        // Tier 4: Extended Valley Base Bridge
        // Connect all lowest sector nodes / piste bottoms to valley lifts within 800m
        if (solution.endNode < 0) {
            levelRelaxed = true;
            const extraEdges = new Map<number, GraphEdge[]>();
            const baseNodes: number[] = [];
            this.network.features.forEach((f) => {
                baseNodes.push(f.bottomNode);
            });

            for (let i = 0; i < baseNodes.length; i++) {
                const u = baseNodes[i];
                const pU = this.network.nodes[u].p;
                for (let j = i + 1; j < baseNodes.length; j++) {
                    const v = baseNodes[j];
                    const pV = this.network.nodes[v].p;
                    const d = calculateDistanceM(pU, pV);
                    if (d <= 850) {
                        const walkTime = Math.max(20, d / WALK_SPEED + 35);
                        const edgeUV: GraphEdge = { to: v, weight: walkTime, featureIndex: -1, distance: d, intermediateCoords: [[pU[0], pU[1]], [pV[0], pV[1]]] };
                        const edgeVU: GraphEdge = { to: u, weight: walkTime, featureIndex: -1, distance: d, intermediateCoords: [[pV[0], pV[1]], [pU[0], pU[1]]] };
                        if (!extraEdges.has(u)) extraEdges.set(u, []);
                        if (!extraEdges.has(v)) extraEdges.set(v, []);
                        extraEdges.get(u)!.push(edgeUV);
                        extraEdges.get(v)!.push(edgeVU);
                    }
                }
            }

            solution = solveDijkstra(allDestPisteNodes, 'all', true, options, extraEdges);
        }

        // Tier 5: Absolute Fail-Safe Bridge
        // In case two sectors in OSM data have zero mapped physical connections,
        // find the reached node closest to any node on destination piste and bridge it with a liaison
        if (solution.endNode < 0) {
            levelRelaxed = true;
            const reach = solveDijkstra(new Set(), 'all', true, options);
            let bestBridgeFrom = -1;
            let bestBridgeTo = -1;
            let minBridgeDist = Infinity;

            const destNodeList = Array.from(allDestPisteNodes);
            for (let u = 0; u < reach.best.length; u++) {
                if (reach.best[u] < Infinity) {
                    const pU = this.network.nodes[u].p;
                    for (const v of destNodeList) {
                        const pV = this.network.nodes[v].p;
                        const d = calculateDistanceM(pU, pV);
                        if (d < minBridgeDist) {
                            minBridgeDist = d;
                            bestBridgeFrom = u;
                            bestBridgeTo = v;
                        }
                    }
                }
            }

            if (bestBridgeFrom >= 0 && bestBridgeTo >= 0) {
                const pU = this.network.nodes[bestBridgeFrom].p;
                const pV = this.network.nodes[bestBridgeTo].p;
                const bridgeEdge: GraphEdge = {
                    to: bestBridgeTo,
                    weight: Math.max(30, minBridgeDist / WALK_SPEED + 40),
                    featureIndex: -1,
                    distance: minBridgeDist,
                    intermediateCoords: [[pU[0], pU[1]], [pV[0], pV[1]]],
                };
                solution = {
                    endNode: bestBridgeTo,
                    best: reach.best,
                    from: reach.from,
                    viaEdge: reach.viaEdge,
                };
                solution.from[bestBridgeTo] = bestBridgeFrom;
                solution.viaEdge[bestBridgeTo] = bridgeEdge;
            }
        }

        const endNode = solution.endNode;
        const from = solution.from;
        const viaEdge = solution.viaEdge;

        if (endNode < 0) {
            return emptyResult('no_route_found');
        }

        // 5. Reconstruct Traversed Edges
        const traversedEdges: { edge: GraphEdge; fromNode: number; toNode: number }[] = [];
        let curr = endNode;
        while (from[curr] >= 0) {
            const prev = from[curr];
            const edge = viaEdge[curr];
            if (!edge) break;
            traversedEdges.push({ edge, fromNode: prev, toNode: curr });
            curr = prev;
        }
        traversedEdges.reverse();

        // 6. Build High-Fidelity Route Legs
        const legs: RouteLeg[] = [];
        let totalDistance = 0;
        let totalAscent = 0;
        let totalDescent = 0;
        let pistesCount = 0;
        let liftsCount = 0;

        const diffLengths: Record<string, number> = {
            novice: 0,
            easy: 0,
            intermediate: 0,
            advanced: 0,
        };

        traversedEdges.forEach(({ edge, fromNode, toNode }) => {
            const feat = edge.featureIndex >= 0 ? this.network.features[edge.featureIndex] : null;
            const kind: 'run' | 'lift' | 'walk' = feat ? feat.kind : 'walk';

            const fromP = this.network.nodes[fromNode].p;
            const toP = this.network.nodes[toNode].p;
            const elevDiff = toP[2] - fromP[2];

            const coords: [number, number][] = edge.intermediateCoords && edge.intermediateCoords.length >= 2
                ? edge.intermediateCoords
                : [
                    [fromP[0], fromP[1]],
                    [toP[0], toP[1]],
                ];

            const lastLeg = legs[legs.length - 1];
            const canMergeWithLast = lastLeg && feat && lastLeg.kind === feat.kind && lastLeg.name === feat.name;

            if (canMergeWithLast) {
                lastLeg.distanceMeters += Math.round(edge.distance);
                for (let i = 1; i < coords.length; i++) {
                    lastLeg.coordinates.push(coords[i]);
                }
                if (elevDiff > 0) lastLeg.ascentMeters += Math.round(elevDiff);
                else lastLeg.descentMeters += Math.round(Math.abs(elevDiff));
            } else {
                if (kind === 'walk' && edge.distance < 10 && legs.length > 0) {
                    return;
                }

                const legName = feat
                    ? feat.name
                    : (edge.distance > 80 ? 'Enlace a pie entre sectores' : (edge.distance > 25 ? 'Transición a pie' : 'Enlace en nieve'));

                const newLeg: RouteLeg = {
                    kind,
                    name: legName,
                    difficulty: feat?.diff,
                    liftType: feat?.liftType,
                    distanceMeters: Math.round(edge.distance),
                    durationSeconds: 0,
                    ascentMeters: elevDiff > 0 ? Math.round(elevDiff) : 0,
                    descentMeters: elevDiff < 0 ? Math.round(Math.abs(elevDiff)) : 0,
                    instruction: '',
                    coordinates: [...coords],
                };
                legs.push(newLeg);
            }
        });

        // If route ended at an intermediate node of destPiste and destCoord is further downstream on it,
        // seamlessly append the downstream ski descent to the destination point!
        const reachedFeatIdx = this.network.nodes[endNode].featureIndex;
        const reachedLocalIdx = this.network.nodes[endNode].nodeLocalIndex;
        if (targetSpecificNode !== null) {
            const targetFeatIdx = this.network.nodes[targetSpecificNode].featureIndex;
            const targetLocalIdx = this.network.nodes[targetSpecificNode].nodeLocalIndex;

            if (reachedFeatIdx === targetFeatIdx && reachedLocalIdx < targetLocalIdx) {
                const targetFeat = this.network.features[reachedFeatIdx];
                const extensionCoords = targetFeat.coordinates
                    .slice(reachedLocalIdx, targetLocalIdx + 1)
                    .map((c) => [c[0], c[1]] as [number, number]);

                let extensionDist = 0;
                for (let i = 1; i < extensionCoords.length; i++) {
                    extensionDist += calculateDistanceM(extensionCoords[i - 1], extensionCoords[i]);
                }
                const elevDiff = targetFeat.coordinates[targetLocalIdx][2] - targetFeat.coordinates[reachedLocalIdx][2];

                const lastLeg = legs[legs.length - 1];
                if (lastLeg && lastLeg.kind === 'run' && lastLeg.name === targetFeat.name) {
                    lastLeg.distanceMeters += Math.round(extensionDist);
                    for (let i = 1; i < extensionCoords.length; i++) {
                        lastLeg.coordinates.push(extensionCoords[i]);
                    }
                    if (elevDiff < 0) lastLeg.descentMeters += Math.round(Math.abs(elevDiff));
                } else {
                    legs.push({
                        kind: 'run',
                        name: targetFeat.name,
                        difficulty: targetFeat.diff,
                        distanceMeters: Math.round(extensionDist),
                        durationSeconds: 0,
                        ascentMeters: 0,
                        descentMeters: elevDiff < 0 ? Math.round(Math.abs(elevDiff)) : 0,
                        instruction: `Descenso por pista ${targetFeat.name}`,
                        coordinates: extensionCoords,
                    });
                }
            }
        }

        // Calculate final durations and human-friendly instructions
        legs.forEach((leg) => {
            totalDistance += leg.distanceMeters;
            totalAscent += leg.ascentMeters;
            totalDescent += leg.descentMeters;

            if (leg.kind === 'run') {
                pistesCount++;
                const speed = RUN_SPEED[leg.difficulty || 'easy'] || RUN_SPEED.other;
                leg.durationSeconds = Math.max(25, Math.round(leg.distanceMeters / speed));
                leg.instruction = `Descenso por pista ${leg.name}`;
                if (leg.difficulty && diffLengths[leg.difficulty] !== undefined) {
                    diffLengths[leg.difficulty] += leg.distanceMeters;
                }
            } else if (leg.kind === 'lift') {
                liftsCount++;
                const speed = LIFT_SPEED[leg.liftType || 'chair_lift'] || 3.0;
                leg.durationSeconds = Math.max(45, Math.round(leg.distanceMeters / speed) + LIFT_WAIT);
                leg.instruction = `Subir en ${leg.name}`;
            } else {
                leg.durationSeconds = Math.max(10, Math.round(leg.distanceMeters / WALK_SPEED));
                leg.instruction = `${leg.name} (${leg.distanceMeters} m)`;
            }
        });

        // 7. Full Geometry for Map Highlighting
        const fullCoords: [number, number][] = [];
        legs.forEach((leg) => {
            leg.coordinates.forEach((pt) => {
                if (fullCoords.length === 0) {
                    fullCoords.push(pt);
                } else {
                    const last = fullCoords[fullCoords.length - 1];
                    if (Math.abs(last[0] - pt[0]) > 1e-6 || Math.abs(last[1] - pt[1]) > 1e-6) {
                        fullCoords.push(pt);
                    }
                }
            });
        });

        const totalDuration = legs.reduce((sum, l) => sum + l.durationSeconds, 0);

        const totalDiffDist = Object.values(diffLengths).reduce((a, b) => a + b, 0) || 1;
        const difficultyBreakdown = {
            novice: Math.round((diffLengths.novice / totalDiffDist) * 100),
            easy: Math.round((diffLengths.easy / totalDiffDist) * 100),
            intermediate: Math.round((diffLengths.intermediate / totalDiffDist) * 100),
            advanced: Math.round((diffLengths.advanced / totalDiffDist) * 100),
        };

        const resolvedOriginName = originPiste?.Name || originLift?.Name || 'Punto de partida';

        return {
            success: true,
            originName: resolvedOriginName,
            destinationName: destPiste.Name || 'Destino',
            totalDistanceMeters: totalDistance,
            totalDurationSeconds: totalDuration,
            totalAscentMeters: totalAscent,
            totalDescentMeters: totalDescent,
            pistesCount,
            liftsCount,
            legs,
            fullCoordinates: fullCoords,
            difficultyBreakdown,
            levelRelaxed,
        };
    }

    /**
     * Calculates the best return route towards the ski resort base (parking / valley / village).
     * Automatically identifies the base piste/station that reaches the lowest elevation.
     */
    public calculateReturnToBase(
        originCoord: [number, number],
        options: RoutingOptions = {},
        originPiste?: Piste,
        originLift?: Lift,
        closingHour: number = 16,
        closingMinute: number = 30
    ): RouteResult & { estimatedReturnTimeMinutes: number; recommendedDepartureStr: string } {
        let lowestPiste: Piste | null = null;
        let lowestElev = Infinity;

        this.rawPistes.forEach((piste) => {
            const rawCoords = piste.GeometryGeoJSON?.coordinates;
            if (!rawCoords || rawCoords.length === 0) return;
            const lastCoord = rawCoords[rawCoords.length - 1];
            const elev = lastCoord[2] ?? 0;
            if (elev > 0 && elev < lowestElev) {
                lowestElev = elev;
                lowestPiste = piste;
            }
        });

        if (!lowestPiste) {
            const basePiste = this.rawPistes.find((p) => {
                const n = (p.Name || '').toLowerCase();
                return n.includes('base') || n.includes('retorn') || n.includes('debutant') || n.includes('estacion');
            });
            lowestPiste = basePiste || this.rawPistes[0];
        }

        const targetPiste = lowestPiste;
        if (!targetPiste) {
            return {
                success: false,
                originName: originPiste?.Name || 'Mi posición',
                destinationName: 'Base de la estación',
                totalDistanceMeters: 0,
                totalDurationSeconds: 0,
                totalAscentMeters: 0,
                totalDescentMeters: 0,
                pistesCount: 0,
                liftsCount: 0,
                legs: [],
                fullCoordinates: [],
                difficultyBreakdown: { novice: 0, easy: 0, intermediate: 0, advanced: 0 },
                error: 'no_base_piste_found',
                estimatedReturnTimeMinutes: 0,
                recommendedDepartureStr: '',
            };
        }

        const routeResult = this.calculateRoute(
            originCoord,
            targetPiste,
            undefined,
            options,
            originPiste,
            originLift
        );

        const returnMins = Math.max(10, Math.round(routeResult.totalDurationSeconds / 60) + 15);
        const closingTotalMins = closingHour * 60 + closingMinute;
        const depTotalMins = Math.max(0, closingTotalMins - returnMins);
        const depH = Math.floor(depTotalMins / 60);
        const depM = depTotalMins % 60;
        const recommendedDepartureStr = `${String(depH).padStart(2, '0')}:${String(depM).padStart(2, '0')}`;

        return {
            ...routeResult,
            destinationName: `Base de la estación (${targetPiste.Name || 'Pista de regreso'})`,
            estimatedReturnTimeMinutes: returnMins,
            recommendedDepartureStr,
        };
    }
}
