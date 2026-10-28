import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import { Accelerometer } from 'expo-sensors';
import { updateTrackingInterval } from './task-manager';

export type MotionState = 'STATIC' | 'MOVING' | 'MOVING_FAST' | 'UNKNOWN';
export type PowerProfile = 'NORMAL' | 'BATTERY_SAVER' | 'EXTREME_COLD';

export interface BatteryOptimizerState {
    motionState: MotionState;
    powerProfile: PowerProfile;
    batteryLevel: number; // 0 to 100
    isCharging: boolean;
    isLowPowerMode: boolean;
    adaptiveGpsEnabled: boolean;
    extremeColdMode: boolean;
    oledPureBlackEnabled: boolean;
    currentIntervalMs: number;
    currentDistanceMeters: number;
    stationarySeconds: number;
    energySavedPercentEstimate: number;
}

export const BATTERY_STORAGE_KEYS = {
    ADAPTIVE_GPS: 'BATTERY_ADAPTIVE_GPS_ENABLED',
    EXTREME_COLD: 'BATTERY_EXTREME_COLD_ENABLED',
    OLED_PURE_BLACK: 'BATTERY_OLED_PURE_BLACK_ENABLED',
};

// Singleton manager
class BatteryOptimizerManager {
    private isRunning = false;
    private accelSubscription: any = null;
    private batteryLevelSub: any = null;
    private batteryStateSub: any = null;

    private motionState: MotionState = 'UNKNOWN';
    private powerProfile: PowerProfile = 'NORMAL';
    private batteryLevel: number = 100;
    private isCharging: boolean = false;
    private isLowPowerMode: boolean = false;

    private adaptiveGpsEnabled: boolean = true;
    private extremeColdMode: boolean = false;
    private oledPureBlackEnabled: boolean = false;

    private currentIntervalMs: number = 5000;
    private currentDistanceMeters: number = 0;
    private baseIntervalMs: number = 5000;
    private baseDistanceMeters: number = 0;

    private accelBuffer: number[] = [];
    private readonly BUFFER_MAX = 20;
    private lastGpsSpeedKmH: number = 0;
    private stationarySeconds: number = 0;
    private stationaryTimer: any = null;
    private energySavedPercentEstimate: number = 0;

    private listeners = new Set<(state: BatteryOptimizerState) => void>();

    constructor() {
        this.loadSettings();
    }

    private async loadSettings() {
        try {
            const [adaptiveStr, coldStr, oledStr] = await Promise.all([
                AsyncStorage.getItem(BATTERY_STORAGE_KEYS.ADAPTIVE_GPS),
                AsyncStorage.getItem(BATTERY_STORAGE_KEYS.EXTREME_COLD),
                AsyncStorage.getItem(BATTERY_STORAGE_KEYS.OLED_PURE_BLACK),
            ]);

            if (adaptiveStr !== null) {
                this.adaptiveGpsEnabled = adaptiveStr === 'true';
            }
            if (coldStr !== null) {
                this.extremeColdMode = coldStr === 'true';
            }
            if (oledStr !== null) {
                this.oledPureBlackEnabled = oledStr === 'true';
            }

            this.updatePowerProfile();
            this.notify();
        } catch (e) {
            console.warn('Error loading battery optimizer settings:', e);
        }
    }

    public getState(): BatteryOptimizerState {
        return {
            motionState: this.motionState,
            powerProfile: this.powerProfile,
            batteryLevel: this.batteryLevel,
            isCharging: this.isCharging,
            isLowPowerMode: this.isLowPowerMode,
            adaptiveGpsEnabled: this.adaptiveGpsEnabled,
            extremeColdMode: this.extremeColdMode,
            oledPureBlackEnabled: this.oledPureBlackEnabled,
            currentIntervalMs: this.currentIntervalMs,
            currentDistanceMeters: this.currentDistanceMeters,
            stationarySeconds: this.stationarySeconds,
            energySavedPercentEstimate: this.energySavedPercentEstimate,
        };
    }

    public subscribe(listener: (state: BatteryOptimizerState) => void): () => void {
        this.listeners.add(listener);
        listener(this.getState());
        return () => {
            this.listeners.delete(listener);
        };
    }

    private notify() {
        const state = this.getState();
        this.listeners.forEach((l) => {
            try {
                l(state);
            } catch (err) {
                console.error('Error in battery optimizer listener:', err);
            }
        });
    }

    public async start(baseIntervalMs: number = 5000, baseDistanceMeters: number = 0) {
        if (this.isRunning) return;
        this.isRunning = true;
        this.baseIntervalMs = baseIntervalMs;
        this.baseDistanceMeters = baseDistanceMeters;
        this.currentIntervalMs = baseIntervalMs;
        this.currentDistanceMeters = baseDistanceMeters;
        this.stationarySeconds = 0;
        this.accelBuffer = [];

        await this.initBatteryMonitoring();
        await this.initMotionMonitoring();

        // Timer de verificación de estado estático cada segundo
        this.stationaryTimer = setInterval(() => {
            this.tickStationaryCheck();
        }, 1000);

        this.notify();
    }

    public stop() {
        if (!this.isRunning) return;
        this.isRunning = false;

        if (this.accelSubscription) {
            this.accelSubscription.remove();
            this.accelSubscription = null;
        }
        if (this.batteryLevelSub) {
            this.batteryLevelSub.remove();
            this.batteryLevelSub = null;
        }
        if (this.batteryStateSub) {
            this.batteryStateSub.remove();
            this.batteryStateSub = null;
        }
        if (this.stationaryTimer) {
            clearInterval(this.stationaryTimer);
            this.stationaryTimer = null;
        }

        this.motionState = 'UNKNOWN';
        this.notify();
    }

    public updateGpsSpeed(speedMpsOrKmH: number, isKmH: boolean = false) {
        this.lastGpsSpeedKmH = isKmH ? speedMpsOrKmH : speedMpsOrKmH * 3.6;
        this.evaluateMotionTransition();
    }

    public async setExtremeColdMode(enabled: boolean) {
        this.extremeColdMode = enabled;
        await AsyncStorage.setItem(BATTERY_STORAGE_KEYS.EXTREME_COLD, enabled ? 'true' : 'false');
        this.updatePowerProfile();
        this.applyAdaptiveGpsInterval();
        this.notify();
    }

    public async setAdaptiveGps(enabled: boolean) {
        this.adaptiveGpsEnabled = enabled;
        await AsyncStorage.setItem(BATTERY_STORAGE_KEYS.ADAPTIVE_GPS, enabled ? 'true' : 'false');
        if (!enabled) {
            // Revert to base interval
            this.currentIntervalMs = this.baseIntervalMs;
            this.currentDistanceMeters = this.baseDistanceMeters;
            await updateTrackingInterval(this.baseIntervalMs, this.baseDistanceMeters);
        } else {
            this.applyAdaptiveGpsInterval();
        }
        this.notify();
    }

    public async setOledPureBlack(enabled: boolean) {
        this.oledPureBlackEnabled = enabled;
        await AsyncStorage.setItem(BATTERY_STORAGE_KEYS.OLED_PURE_BLACK, enabled ? 'true' : 'false');
        this.notify();
    }

    private async initBatteryMonitoring() {
        if (Platform.OS === 'web') return;
        try {
            const isAvailable = await Battery.isAvailableAsync();
            if (!isAvailable) return;

            const [level, isLowPower, batteryState] = await Promise.all([
                Battery.getBatteryLevelAsync(),
                Battery.isLowPowerModeEnabledAsync(),
                Battery.getBatteryStateAsync(),
            ]);

            this.batteryLevel = Math.round(Math.max(0, level * 100));
            this.isLowPowerMode = isLowPower;
            this.isCharging = batteryState === Battery.BatteryState.CHARGING || batteryState === Battery.BatteryState.FULL;

            this.batteryLevelSub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
                this.batteryLevel = Math.round(Math.max(0, batteryLevel * 100));
                this.updatePowerProfile();
                this.notify();
            });

            this.batteryStateSub = Battery.addBatteryStateListener(({ batteryState }) => {
                this.isCharging = batteryState === Battery.BatteryState.CHARGING || batteryState === Battery.BatteryState.FULL;
                this.updatePowerProfile();
                this.notify();
            });

            this.updatePowerProfile();
        } catch (e) {
            console.warn('Battery monitoring init error:', e);
        }
    }

    private updatePowerProfile() {
        if (this.extremeColdMode) {
            this.powerProfile = 'EXTREME_COLD';
        } else if (this.isLowPowerMode || (this.batteryLevel <= 20 && !this.isCharging)) {
            this.powerProfile = 'BATTERY_SAVER';
        } else {
            this.powerProfile = 'NORMAL';
        }
    }

    private async initMotionMonitoring() {
        if (Platform.OS === 'web') return;
        try {
            const isAvailable = await Accelerometer.isAvailableAsync();
            if (!isAvailable) return;

            // Frecuencia baja de 1000ms: consume microamperios insignificantes
            Accelerometer.setUpdateInterval(1000);

            this.accelSubscription = Accelerometer.addListener(({ x, y, z }) => {
                const magnitude = Math.sqrt(x * x + y * y + z * z);
                // Delta respecto a gravedad terrestre (1g)
                const delta = Math.abs(magnitude - 1.0);

                this.accelBuffer.push(delta);
                if (this.accelBuffer.length > this.BUFFER_MAX) {
                    this.accelBuffer.shift();
                }

                this.evaluateMotionTransition();
            });
        } catch (e) {
            console.warn('Motion monitoring init error:', e);
        }
    }

    private evaluateMotionTransition() {
        if (!this.isRunning || !this.adaptiveGpsEnabled) return;

        const avgDelta = this.accelBuffer.length > 0
            ? this.accelBuffer.reduce((a, b) => a + b, 0) / this.accelBuffer.length
            : 0;

        const speed = this.lastGpsSpeedKmH;

        let nextState: MotionState = this.motionState;

        // Detectar si el usuario está en movimiento rápido (descenso de esquí, curvas dinámicas)
        if (speed >= 18 || avgDelta >= 0.25) {
            nextState = 'MOVING_FAST';
            this.stationarySeconds = 0;
        } else if (speed >= 2.5 || avgDelta >= 0.08) {
            nextState = 'MOVING';
            this.stationarySeconds = 0;
        } else {
            // Posible estado estático (cola de remonte, cafetería o descanso)
            if (this.stationarySeconds >= 20) {
                nextState = 'STATIC';
            }
        }

        if (nextState !== this.motionState) {
            this.motionState = nextState;
            this.applyAdaptiveGpsInterval();
            this.notify();
        }
    }

    private tickStationaryCheck() {
        if (!this.isRunning || !this.adaptiveGpsEnabled) return;

        const avgDelta = this.accelBuffer.length > 0
            ? this.accelBuffer.reduce((a, b) => a + b, 0) / this.accelBuffer.length
            : 0;

        if (this.lastGpsSpeedKmH < 2.0 && avgDelta < 0.07) {
            this.stationarySeconds += 1;
            if (this.stationarySeconds >= 20 && this.motionState !== 'STATIC') {
                this.motionState = 'STATIC';
                this.applyAdaptiveGpsInterval();
                this.notify();
            }
        } else {
            if (this.stationarySeconds > 0) {
                this.stationarySeconds = Math.max(0, this.stationarySeconds - 2);
            }
        }

        // Estimar ahorro de energía acumulado comparado con muestreo continuo a 2s
        if (this.motionState === 'STATIC') {
            this.energySavedPercentEstimate = Math.min(85, this.energySavedPercentEstimate + 0.1);
        }
    }

    private async applyAdaptiveGpsInterval() {
        if (!this.isRunning || !this.adaptiveGpsEnabled) return;

        let targetInterval = this.baseIntervalMs;
        let targetDistance = this.baseDistanceMeters;

        switch (this.motionState) {
            case 'STATIC':
                // Usuario en cola, terraza o quieto: extender intervalo GPS para ahorrar batería máxima
                targetInterval = this.powerProfile === 'EXTREME_COLD' ? 30000 : 20000;
                targetDistance = 15;
                break;
            case 'MOVING_FAST':
                // Descenso rápido en pista: máxima precisión de trazado
                targetInterval = this.powerProfile === 'EXTREME_COLD' ? 3000 : 2000;
                targetDistance = 1;
                break;
            case 'MOVING':
            default:
                // Remonte mecánico o esquí suave
                targetInterval = this.powerProfile === 'EXTREME_COLD' ? 6000 : 4000;
                targetDistance = 4;
                break;
        }

        if (this.currentIntervalMs !== targetInterval || this.currentDistanceMeters !== targetDistance) {
            this.currentIntervalMs = targetInterval;
            this.currentDistanceMeters = targetDistance;
            await updateTrackingInterval(targetInterval, targetDistance);
        }
    }
}

export const batteryOptimizer = new BatteryOptimizerManager();
