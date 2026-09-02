import { createContext, ReactNode, useContext } from 'react';

import { OtaUpdateInfo, OtaPhase, OtaChannel, useOtaUpdates } from 'hooks/use-ota-updates.hook';

type OtaContextValue = {
    phase: OtaPhase;
    channel: OtaChannel;
    updateInfo: OtaUpdateInfo | null;
    downloadProgress: number;
    optionalModalVisible: boolean;
    hasOptionalUpdate: boolean;
    isBlocking: boolean;
    isDownloading: boolean;
    openOptionalModal: () => void;
    dismissOptionalModal: () => void;
    applyUpdate: () => Promise<void>;
    checkForUpdates: (overrideChannel?: OtaChannel) => Promise<void>;
    switchChannel: (newChannel: OtaChannel) => Promise<void>;
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
