import { Lift, Resort, ResortDetail } from '../models/ski-resort.model';

export interface LiftClosureStatus {
    alertActive: boolean;
    urgent: boolean;
    closingTimeStr: string;
    minutesLeft: number;
    recommendedDepartureStr: string;
    criticalLiftName?: string;
    message: string;
}

/**
 * Gets estimated or configured closing time for a lift or resort.
 * Standard ski resort closure in Spain/Alps is 16:30 (summit lifts 16:15).
 */
export const getLiftClosingTime = (
    lift?: Lift,
    _resort?: ResortDetail | Resort
): { hour: number; minute: number; text: string } => {
    // 1. Check if lift tags contain closing time
    if (lift?.Tags?.closing_time) {
        const parts = String(lift.Tags.closing_time).split(':');
        if (parts.length >= 2) {
            const h = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (!isNaN(h) && !isNaN(m)) {
                return { hour: h, minute: m, text: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
            }
        }
    }

    // 2. High altitude or drag lifts usually close 15-20 mins earlier
    const isSummitOrConnector =
        lift?.LiftType === 'cable_car' ||
        lift?.LiftType === 'drag_lift' ||
        lift?.Name?.toLowerCase().includes('cumbre') ||
        lift?.Name?.toLowerCase().includes('veleta') ||
        lift?.Name?.toLowerCase().includes('pico');

    if (isSummitOrConnector) {
        return { hour: 16, minute: 15, text: '16:15' };
    }

    // 3. Default station lift closure: 16:30
    return { hour: 16, minute: 30, text: '16:30' };
};

/**
 * Checks whether an alert should be shown to the user regarding lift closures.
 * Starts warning users from 15:30 onwards if lifts close around 16:15 - 16:30.
 */
export const evaluateLiftClosureAlert = (
    lifts: Lift[] = [],
    resort?: ResortDetail | Resort,
    now: Date = new Date(),
    estimatedReturnMins: number = 20
): LiftClosureStatus => {
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTotalMins = currentHour * 60 + currentMinute;

    // Find earliest closing lift among resort lifts
    let earliestClosingMins = 16 * 60 + 30; // default 16:30
    let earliestTimeStr = '16:30';
    let criticalLiftName = lifts[0]?.Name || 'remontes de enlace';

    lifts.forEach((lift) => {
        const { hour, minute, text } = getLiftClosingTime(lift, resort);
        const total = hour * 60 + minute;
        if (total < earliestClosingMins) {
            earliestClosingMins = total;
            earliestTimeStr = text;
            criticalLiftName = lift.Name || criticalLiftName;
        }
    });

    const minutesLeft = earliestClosingMins - currentTotalMins;

    // Only alert between 14:30 and 17:30
    if (currentHour < 14 || currentHour > 17 || minutesLeft > 60 || minutesLeft < -30) {
        return {
            alertActive: false,
            urgent: false,
            closingTimeStr: earliestTimeStr,
            minutesLeft: Math.max(0, minutesLeft),
            recommendedDepartureStr: '',
            message: '',
        };
    }

    const depTotalMins = Math.max(0, earliestClosingMins - estimatedReturnMins);
    const depH = Math.floor(depTotalMins / 60);
    const depM = depTotalMins % 60;
    const recommendedDepartureStr = `${String(depH).padStart(2, '0')}:${String(depM).padStart(2, '0')}`;

    const urgent = minutesLeft <= 25;
    let message = '';
    if (minutesLeft <= 0) {
        message = `Los remontes (${earliestTimeStr}) han cerrado o están cerrando. Dirígete a la base por pistas habilitadas.`;
    } else if (urgent) {
        message = `¡Atención! Últimas subidas en ${criticalLiftName} (${earliestTimeStr}, quedan ${minutesLeft} min). Debes regresar a la base inmediatamente.`;
    } else {
        message = `Aviso de cierre: Los remontes cierran a las ${earliestTimeStr}. Emprende el regreso hacia la base antes de las ${recommendedDepartureStr}.`;
    }

    return {
        alertActive: true,
        urgent,
        closingTimeStr: earliestTimeStr,
        minutesLeft,
        recommendedDepartureStr,
        criticalLiftName,
        message,
    };
};
