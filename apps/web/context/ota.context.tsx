import { createContext, ReactNode, useContext } from 'react';

import { OtaUpdateInfo, OtaPhase, useOtaUpdates } from 'hooks/use-ota-updates.hook';

type OtaContextValue = {
    phase: OtaPhase;
    updateInfo: OtaUpdateInfo | null;
    optionalModalVisible: boolean;
    hasOptionalUpdate: boolean;
    isBlocking: boolean;
    isDownloading: boolean;
    openOptionalModal: () => void;
    dismissOptionalModal: () => void;
    applyUpdate: () => Promise<void>;
};

const OtaContext = createContext<OtaContextValue | null>(null);

export const OtaProvider = ({ children }: { children: ReactNode }) => {
    const value = useOtaUpdates();
    return <OtaContext.Provider value={value}>{children}</OtaContext.Provider>;
};

export const useOta = () => {
    const ctx = useContext(OtaContext);
    if (!ctx) {
        throw new Error('useOta must be used within OtaProvider');
    }

    return ctx;
};
