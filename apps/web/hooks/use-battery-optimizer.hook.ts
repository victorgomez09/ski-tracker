import { useEffect, useState, useCallback } from 'react';
import {
    batteryOptimizer,
    BatteryOptimizerState,
} from 'tracking/battery-optimizer';

export const useBatteryOptimizer = () => {
    const [state, setState] = useState<BatteryOptimizerState>(batteryOptimizer.getState());

    useEffect(() => {
        const unsubscribe = batteryOptimizer.subscribe((next) => {
            setState(next);
        });
        return unsubscribe;
    }, []);

    const setExtremeColdMode = useCallback(async (enabled: boolean) => {
        await batteryOptimizer.setExtremeColdMode(enabled);
    }, []);

    const toggleExtremeColdMode = useCallback(async () => {
        await batteryOptimizer.setExtremeColdMode(!state.extremeColdMode);
    }, [state.extremeColdMode]);

    const setAdaptiveGps = useCallback(async (enabled: boolean) => {
        await batteryOptimizer.setAdaptiveGps(enabled);
    }, []);

    const toggleAdaptiveGps = useCallback(async () => {
        await batteryOptimizer.setAdaptiveGps(!state.adaptiveGpsEnabled);
    }, [state.adaptiveGpsEnabled]);

    const setOledPureBlack = useCallback(async (enabled: boolean) => {
        await batteryOptimizer.setOledPureBlack(enabled);
    }, []);

    const toggleOledPureBlack = useCallback(async () => {
        await batteryOptimizer.setOledPureBlack(!state.oledPureBlackEnabled);
    }, [state.oledPureBlackEnabled]);

    return {
        ...state,
        setExtremeColdMode,
        toggleExtremeColdMode,
        setAdaptiveGps,
        toggleAdaptiveGps,
        setOledPureBlack,
        toggleOledPureBlack,
    };
};
