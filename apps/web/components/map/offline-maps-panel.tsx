import { OfflinePackInfo } from 'hooks/use-offline.hook';
import { CheckCircle2, Download, HardDrive, Trash2, WifiOff, X } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

interface OfflineMapsModalProps {
    onClose: () => void;
    packs: OfflinePackInfo[];
    downloadingPack: string | null;
    downloadProgress: number;
    onDownloadCurrentArea: (customName: string) => void;
    onDeletePack: (packName: string) => void;
    currentResortName?: string;
}

export const OfflineMapsModal = ({
    onClose,
    packs,
    downloadingPack,
    downloadProgress,
    onDownloadCurrentArea,
    onDeletePack,
    currentResortName,
}: OfflineMapsModalProps) => {
    const { t } = useTranslation();
    const [zoneName, setZoneName] = useState(currentResortName || t('zona_esqui'));
    const [activeTab, setActiveTab] = useState<'download' | 'manage'>('download');

    const handleStartDownload = () => {
        if (!zoneName.trim()) return;
        onDownloadCurrentArea(zoneName.trim());
    };

    return (
        <View className="absolute inset-0 flex items-center justify-center bg-black/50 z-50">
            <View className="absolute z-50 bg-slate-900/95 border border-slate-700 shadow-md p-4 rounded-md w-11/12 h-11/12">
                {/* Cabecera */}
                <View className="flex-row justify-between items-center pb-2 border-b border-slate-800">
                    <View className="flex-row items-center gap-2">
                        <WifiOff size={18} color="#60a5fa" />
                        <Text className="font-extrabold text-sm text-white">{t('mapas_offline')}</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} className="p-1.5 bg-slate-800 rounded-full">
                        <X size={16} color="#94a3b8" />
                    </TouchableOpacity>
                </View>

                {/* Pestañas de Navegación */}
                <View className="flex-row bg-slate-800 p-1 rounded-md">
                    <TouchableOpacity
                        className={`flex-1 py-1.5 rounded-md items-center ${activeTab === 'download' ? 'bg-blue-600' : ''}`}
                        onPress={() => setActiveTab('download')}
                    >
                        <Text className={`text-xs font-bold ${activeTab === 'download' ? 'text-white' : 'text-slate-400'}`}>
                            {t('descargar')}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        className={`flex-1 py-1.5 rounded-md items-center ${activeTab === 'manage' ? 'bg-blue-600' : ''}`}
                        onPress={() => setActiveTab('manage')}
                    >
                        <Text className={`text-xs font-bold ${activeTab === 'manage' ? 'text-white' : 'text-slate-400'}`}>
                            {t('zonas_count', { count: packs.length })}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Pestaña: Descargar Zona Actual */}
                {activeTab === 'download' && (
                    <View className="flex flex-col gap-2">
                        <Text className="text-xs text-slate-300">
                            {t('descargar_desc')}
                        </Text>

                        <View className="space-y-1">
                            <Text className="text-[10px] font-bold text-slate-400 uppercase">{t('nombre_zona')}</Text>
                            <TextInput
                                value={zoneName}
                                onChangeText={setZoneName}
                                placeholder={t('ej_baqueira') as string}
                                placeholderTextColor="#64748b"
                                className="bg-slate-800 border border-slate-700 text-white rounded-md px-3 py-2 text-xs font-semibold"
                            />
                        </View>

                        {downloadingPack ? (
                            <View className="bg-slate-800/80 p-3 rounded-md border border-slate-700 space-y-2">
                                <View className="flex-row justify-between items-center">
                                    <Text className="text-xs font-bold text-blue-400">{t('descargando_pack', { pack: downloadingPack })}</Text>
                                    <Text className="text-xs font-bold text-white">{downloadProgress.toFixed(0)}%</Text>
                                </View>
                                {/* Barra de Progreso */}
                                <View className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                                    <View
                                        className="h-full bg-blue-500 rounded-full"
                                        style={{ width: `${downloadProgress}%` }}
                                    />
                                </View>
                            </View>
                        ) : (
                            <TouchableOpacity
                                onPress={handleStartDownload}
                                className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 p-3 rounded-md flex-row items-center justify-center gap-2 shadow-lg"
                            >
                                <Download size={16} color="#ffffff" />
                                <Text className="text-xs font-bold text-white">{t('guardar_zona')}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* Pestaña: Gestionar Zonas Guardadas */}
                {activeTab === 'manage' && (
                    <ScrollView className="max-h-60 flex flex-col gap-2 mt-2">
                        {packs.length === 0 ? (
                            <View className="py-6 items-center justify-center">
                                <HardDrive size={32} color="#475569" />
                                <Text className="text-xs text-slate-400 mt-2">{t('no_downloaded_zones')}</Text>
                            </View>
                        ) : (
                            packs.map((pack) => (
                                <View
                                    key={pack.name}
                                    className="bg-slate-800 p-3 rounded-md border border-slate-700 flex-row justify-between items-center"
                                >
                                    <View className="flex-row items-center gap-2">
                                        <CheckCircle2 size={16} color="#10b981" />
                                        <View>
                                            <Text className="font-bold text-xs text-white">{pack.name}</Text>
                                            <Text className="text-[10px] text-slate-400">{t('disponible_offline')}</Text>
                                        </View>
                                    </View>

                                    <TouchableOpacity
                                        onPress={() => onDeletePack(pack.name)}
                                        className="p-2 bg-rose-950/40 border border-rose-800/60 rounded-md"
                                    >
                                        <Trash2 size={14} color="#f43f5e" />
                                    </TouchableOpacity>
                                </View>
                            ))
                        )}
                    </ScrollView>
                )}
            </View>
        </View>
    );
};