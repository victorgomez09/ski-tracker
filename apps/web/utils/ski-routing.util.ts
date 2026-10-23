import { Lift, Piste } from '../models/ski-resort.model';

export type SkillLevel = 'all' | 'noblack' | 'easy';

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
const WALK_SPEED = 1.1;     // m/s on flat snow with skis

// Realistic connection distances in meters (no cross-country trekking)
const MAX_PISTE_TO_LIFT_M = 95;    // Piste bottom to lift base
const MAX_LIFT_TO_PISTE_M = 110;   // Lift top to piste head
const MAX_LIFT_TO_LIFT_M = 85;     // Lift top to next lift base (hub/station transfer)
const MAX_PISTE_TO_PISTE_M = 70;   // Piste bottom to next piste head
const MAX_PISTE_JUNCTION_M = 22;   // Direct intersection/fork between two pistes
const MAX_SNAP_DIST_M = 140;       // Maximum distance to snap GPS/tap to a piste/lift

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
    featureIndex: number; // -1 for connection
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
        // 1. Check elevationProfile heights in tags
        const hs = piste.Tags?.elevationProfile?.heights;
        if (Array.isArray(hs) && hs.length >= 2) {
            const first = Number(hs[0]);
            const last = Number(hs[hs.length - 1]);
            if (!isNaN(first) && !isNaN(last) && Math.abs(first - last) > 1) {
                return { startElev: first, endElev: last };
            }
        }
        // 2. Check 3D coordinates (with cumulative ascent vs descent)
        const coords3D = piste.GeometryGeoJSON?.coordinates;
        if (coords3D && coords3D.length >= 2) {
            let totalAscent = 0;
            let totalDescent = 0;
            let valid = false;
            for (let i = 0; i < coords3D.length - 1; i++) {
                const e0 = Number(coords3D[i]?.[2]);
                const e1 = Number(coords3D[i + 1]?.[2]);
                if (!isNaN(e0) && !isNaN(e1) && e0 > 0 && e1 > 0) {
                    valid = true;
                    if (e1 > e0) totalAscent += (e1 - e0);
                    else totalDescent += (e0 - e1);
                }
            }
            if (valid && (totalAscent > 0 || totalDescent > 0)) {
                const cFirst = coords3D[0];
                const cLast = coords3D[coords3D.length - 1];
                const e1 = Number(cFirst?.[2]);
                const e2 = Number(cLast?.[2]);
                if (totalAscent > totalDescent + 2) {
                    return { startElev: e1 || 1000, endElev: (e1 || 1000) + totalAscent };
                } else if (totalDescent > totalAscent + 2) {
                    return { startElev: (e2 || 1000) + totalDescent, endElev: e2 || 1000 };
                }
                if (!isNaN(e1) && !isNaN(e2) && Math.abs(e1 - e2) > 1) {
                    return { startElev: e1, endElev: e2 };
                }
            }
        }
        // 3. Check elevation provider
        if (elevProvider && coords.length >= 2) {
            const e1 = elevProvider(coords[0]);
            const e2 = elevProvider(coords[coords.length - 1]);
            if (e1 !== null && e2 !== null && !isNaN(e1) && !isNaN(e2) && Math.abs(e1 - e2) > 1) {
                return { startElev: e1, endElev: e2 };
            }
        }
        // 4. Topological lift proximity inference:
        // Lifts always go Base -> Summit.
        // If coords[0] is closer to lift bases and coords[last] is closer to lift summits,
        // then coords[0] is base and coords[last] is summit (piste was drawn uphill!).
        if (liftBases && liftSummits && coords.length >= 2 && liftBases.length > 0 && liftSummits.length > 0) {
            const c0 = coords[0];
            const c1 = coords[coords.length - 1];

            const minBaseDist0 = Math.min(...liftBases.map((b) => calculateDistanceM(c0, b)));
            const minSummitDist0 = Math.min(...liftSummits.map((s) => calculateDistanceM(c0, s)));
            const minBaseDist1 = Math.min(...liftBases.map((b) => calculateDistanceM(c1, b)));
            const minSummitDist1 = Math.min(...liftSummits.map((s) => calculateDistanceM(c1, s)));

            // If c0 is near a lift base and c1 is near a lift summit:
            // c0 is base (low), c1 is summit (high) => uphill!
            if (minBaseDist0 < 120 && minSummitDist1 < 140 && minSummitDist0 > minBaseDist0) {
                return { startElev: 1000, endElev: 2000 };
            }
            // If c0 is near a lift summit and c1 is near a lift base:
            // c0 is summit (high), c1 is base (low) => downhill!
            if (minSummitDist0 < 140 && minBaseDist1 < 120 && minBaseDist0 > minSummitDist0) {
                return { startElev: 2000, endElev: 1000 };
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
            if (!isNaN(e1) && !isNaN(e2) && e1 > 0 && e2 > 0 && Math.abs(e1 - e2) > 1) {
                return { startElev: e1, endElev: e2 };
            }
        }
        if (elevProvider && coords.length >= 2) {
            const e1 = elevProvider(coords[0]);
            const e2 = elevProvider(coords[coords.length - 1]);
            if (e1 !== null && e2 !== null && !isNaN(e1) && !isNaN(e2) && Math.abs(e1 - e2) > 1) {
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
                if (startElev !== null && endElev !== null && startElev > endElev + 2) {
                    liftBases.push(flat[flat.length - 1]);
                    liftSummits.push(flat[0]);
                } else {
                    liftBases.push(flat[0]);
                    liftSummits.push(flat[flat.length - 1]);
                }
            }
        });

        // 1. Process Pistes (Strictly Downhill)
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

            // If start elevation is lower than end elevation, it was drawn uphill.
            // Reverse so index 0 is at the summit (top) and last index is at base (bottom).
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
                    const weight = Math.max(1, dist / speed);
                    // Defensive guard: never allow a run edge to climb > 2.5m elevation
                    const elevGain =
                        pt[2] > 0 && nodes[prevNode].p[2] > 0
                            ? pt[2] - nodes[prevNode].p[2]
                            : 0;
                    if (elevGain <= 2.5) {
                        // Directed downhill edge ONLY: prevNode -> n
                        addEdge(prevNode, n, weight, featIdx, dist, [
                            [nodes[prevNode].p[0], nodes[prevNode].p[1]],
                            [pt[0], pt[1]],
                        ]);
                    }
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

        // 2. Process Lifts (Strictly Uphill)
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

            // Uphill edge ONLY: bottom -> top
            addEdge(bottom, top, rideTime + LIFT_WAIT, featIdx, totalLiftDist, fullLiftCoords);

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

        // 3. Connect Stations & Pistes (Strictly Realistic Interchanges Only)
        const pisteFeatures = features.filter((f) => f.kind === 'run');
        const liftFeatures = features.filter((f) => f.kind === 'lift');

        // Rule 3A: Piste bottom -> Lift base station (Skiing into lift line)
        pisteFeatures.forEach((pf) => {
            const pBottom = nodes[pf.bottomNode];
            liftFeatures.forEach((lf) => {
                const lBottom = nodes[lf.bottomNode];
                const d = calculateDistanceM(pBottom.p, lBottom.p);
                if (d <= MAX_PISTE_TO_LIFT_M) {
                    const walkTime = Math.max(5, d / WALK_SPEED + 10);
                    addEdge(pf.bottomNode, lf.bottomNode, walkTime, -1, d, [
                        [pBottom.p[0], pBottom.p[1]],
                        [lBottom.p[0], lBottom.p[1]],
                    ]);
                }
            });
        });

        // Rule 3B: Lift top station -> Piste head (Sliding off lift to run start)
        liftFeatures.forEach((lf) => {
            const lTop = nodes[lf.topNode];
            pisteFeatures.forEach((pf) => {
                const pTop = nodes[pf.topNode];
                const d = calculateDistanceM(lTop.p, pTop.p);
                if (d <= MAX_LIFT_TO_PISTE_M) {
                    const slideTime = Math.max(4, d / 3.0 + 8);
                    addEdge(lf.topNode, pf.topNode, slideTime, -1, d, [
                        [lTop.p[0], lTop.p[1]],
                        [pTop.p[0], pTop.p[1]],
                    ]);
                }
            });
        });

        // Rule 3C: Lift top station -> Another lift base station (Lift interchange hub)
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

        // Rule 3D: Piste bottom -> Next Piste start (End of one piste continuing into another)
        pisteFeatures.forEach((pf1) => {
            const p1Bottom = nodes[pf1.bottomNode];
            pisteFeatures.forEach((pf2) => {
                if (pf1 === pf2) return;
                const p2Top = nodes[pf2.topNode];
                // Do not allow climbing uphill to the start of another piste without a lift
                if (p1Bottom.p[2] > 0 && p2Top.p[2] > 0 && p2Top.p[2] > p1Bottom.p[2] + 2) {
                    return;
                }
                const d = calculateDistanceM(p1Bottom.p, p2Top.p);
                if (d <= MAX_PISTE_TO_PISTE_M) {
                    const glideTime = Math.max(3, d / 4.0);
                    addEdge(pf1.bottomNode, pf2.topNode, glideTime, -1, d, [
                        [p1Bottom.p[0], p1Bottom.p[1]],
                        [p2Top.p[0], p2Top.p[1]],
                    ]);
                }
            });
        });

        // Rule 3E: Mid-piste intersections / forks (pistes that cross or merge within 22m)
        const G = 600;
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
                                // Do not allow mid-piste transitions that climb uphill by more than 2 meters
                                if (n1.p[2] > 0 && n2.p[2] > 0 && n2.p[2] > n1.p[2] + 2) {
                                    return;
                                }
                                addEdge(n1Idx, n2Idx, Math.max(2, d / 5.0), -1, d, [
                                    [n1.p[0], n1.p[1]],
                                    [n2.p[0], n2.p[1]],
                                ]);
                            }
                        });
                    }
                }
            });
        });

        // Rule 3F: Piste points along lower section passing close to a lift base station
        pisteFeatures.forEach((pf) => {
            const count = pf.nodeIndices.length;
            const checkStartIndex = Math.floor(count * 0.35);
            for (let idx = checkStartIndex; idx < count; idx++) {
                const nIdx = pf.nodeIndices[idx];
                const pNode = nodes[nIdx];
                liftFeatures.forEach((lf) => {
                    const lBottom = nodes[lf.bottomNode];
                    const d = calculateDistanceM(pNode.p, lBottom.p);
                    if (d <= 50) {
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

    public findNearestNodeOnLift(liftId: string, _coord?: [number, number]): number | null {
        const feat = this.network.features.find((f) => f.kind === 'lift' && f.lift?.ID === liftId);
        if (!feat) return null;
        return feat.bottomNode;
    }

    public calculateRoute(
        originCoord: [number, number],
        destPiste: Piste,
        destCoord?: [number, number],
        level: SkillLevel = 'all',
        originPiste?: Piste,
        originLift?: Lift,
        elevationProvider?: ElevationProvider
    ): RouteResult {
        // If elevationProvider is supplied and wasn't available at initialization, rebuild network with DEM elevations
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

        // 1. Identify Start Candidate Nodes
        const startCandidates: { node: number; cost: number; distance: number }[] = [];

        if (originPiste) {
            const n = this.findNearestNodeOnPiste(originPiste.ID, originCoord);
            if (n !== null) {
                startCandidates.push({ node: n, cost: 0, distance: 0 });
            }
        } else if (originLift) {
            const n = this.findNearestNodeOnLift(originLift.ID, originCoord);
            if (n !== null) {
                startCandidates.push({ node: n, cost: 0, distance: 0 });
            }
        } else {
            // Find accessible nodes (both nearby pistes and lift bases)
            this.network.nodes.forEach((n, idx) => {
                if (this.network.adj[idx].length === 0) return;
                const d = calculateDistanceM(originCoord, n.p);
                if (d <= MAX_SNAP_DIST_M) {
                    const isLiftBase = this.network.features[n.featureIndex]?.kind === 'lift' && n.nodeLocalIndex === 0;
                    startCandidates.push({
                        node: idx,
                        distance: d,
                        cost: d / WALK_SPEED + (isLiftBase ? 0 : 5),
                    });
                }
            });
            startCandidates.sort((a, b) => a.distance - b.distance);
        }

        if (startCandidates.length === 0) {
            return emptyResult('no_start_point_nearby');
        }

        // 2. Identify Target Node(s) on Destination Piste
        const destFeats = this.network.features.filter((f) => f.kind === 'run' && f.piste?.ID === destPiste.ID);
        if (destFeats.length === 0) {
            return emptyResult('no_dest_point_nearby');
        }

        const targetNodeSet = new Set<number>();

        if (destCoord) {
            const specificDestNode = this.findNearestNodeOnPiste(destPiste.ID, destCoord);
            if (specificDestNode !== null) {
                targetNodeSet.add(specificDestNode);
            }
        }

        // If no destCoord or specificDestNode was found, target the head (topNode) of the destination piste
        // so the skier reaches the run to ski it down!
        if (targetNodeSet.size === 0) {
            destFeats.forEach((f) => {
                targetNodeSet.add(f.topNode);
            });
        }

        if (targetNodeSet.size === 0) {
            return emptyResult('no_dest_point_nearby');
        }

        // 3. Special Case: Same Piste and Start is strictly upstream of Target
        if (originPiste && originPiste.ID === destPiste.ID && startCandidates.length > 0) {
            const startNode = startCandidates[0].node;
            const originFeat = destFeats[0];
            const startLocalIdx = this.network.nodes[startNode].nodeLocalIndex;
            const targetNode = Array.from(targetNodeSet)[0];
            const targetLocalIdx = this.network.nodes[targetNode].nodeLocalIndex;

            if (startLocalIdx < targetLocalIdx) {
                // Skier simply descends this piste from start to target!
                const sliceCoords = originFeat.coordinates
                    .slice(startLocalIdx, targetLocalIdx + 1)
                    .map((c) => [c[0], c[1]] as [number, number]);

                let dist = 0;
                for (let i = 1; i < sliceCoords.length; i++) {
                    dist += calculateDistanceM(sliceCoords[i - 1], sliceCoords[i]);
                }
                const speed = RUN_SPEED[originFeat.diff] || RUN_SPEED.other;
                const duration = Math.max(20, Math.round(dist / speed));
                const descent = Math.max(0, Math.round(originFeat.coordinates[startLocalIdx][2] - originFeat.coordinates[targetLocalIdx][2]));

                const leg: RouteLeg = {
                    kind: 'run',
                    name: originFeat.name,
                    difficulty: originFeat.diff,
                    distanceMeters: Math.round(dist),
                    durationSeconds: duration,
                    ascentMeters: 0,
                    descentMeters: descent,
                    instruction: `Descenso por pista ${originFeat.name}`,
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
                        novice: originFeat.diff === 'novice' ? 100 : 0,
                        easy: originFeat.diff === 'easy' ? 100 : 0,
                        intermediate: originFeat.diff === 'intermediate' ? 100 : 0,
                        advanced: ['advanced', 'expert'].includes(originFeat.diff) ? 100 : 0,
                    },
                };
            }
        }

        // 4. Dijkstra Algorithm with Priority Queue
        const numNodes = this.network.nodes.length;
        const best = new Float64Array(numNodes).fill(Infinity);
        const from = new Int32Array(numNodes).fill(-1);
        const viaEdge = new Array<GraphEdge | null>(numNodes).fill(null);

        // Min-heap: elements are [cost, nodeIndex]
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

        // Initialize all start candidates
        startCandidates.forEach((sc) => {
            if (sc.cost < best[sc.node]) {
                best[sc.node] = sc.cost;
                push(sc.cost, sc.node);
            }
        });

        let endNode = -1;

        while (heap.length > 0) {
            const current = pop();
            if (!current) break;
            const [c, u] = current;

            if (c > best[u]) continue;

            if (targetNodeSet.has(u)) {
                endNode = u;
                break;
            }

            const edges = this.network.adj[u] || [];
            for (let i = 0; i < edges.length; i++) {
                const e = edges[i];

                // Check skill level filter on downhill runs
                if (e.featureIndex >= 0) {
                    const feat = this.network.features[e.featureIndex];
                    if (feat && feat.kind === 'run') {
                        if (level === 'easy' && !EASY_LEVEL[feat.diff]) continue;
                        if (level === 'noblack' && !NO_BLACK_LEVEL[feat.diff]) continue;
                    }
                }

                const nextCost = c + e.weight;
                if (nextCost < best[e.to]) {
                    best[e.to] = nextCost;
                    from[e.to] = u;
                    viaEdge[e.to] = e;
                    push(nextCost, e.to);
                }
            }
        }

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

        // 6. Build High-Fidelity Legs with Exact Piste and Lift Coordinates
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
                // Append coordinates avoiding duplicate joint point
                for (let i = 1; i < coords.length; i++) {
                    lastLeg.coordinates.push(coords[i]);
                }
                if (elevDiff > 0) lastLeg.ascentMeters += Math.round(elevDiff);
                else lastLeg.descentMeters += Math.round(Math.abs(elevDiff));
            } else {
                // If it's a tiny walk under 12m between consecutive legs, omit as standalone step
                if (kind === 'walk' && edge.distance < 12 && legs.length > 0) {
                    return;
                }

                const legName = feat
                    ? feat.name
                    : (edge.distance > 25 ? 'Transición a pie' : 'Enlace en nieve');

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

        // Calculate durations and instructions
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
        };
    }
}
