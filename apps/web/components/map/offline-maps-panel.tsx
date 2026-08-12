import { OfflinePackInfo } from 'hooks/use-offline.hook';
import { CheckCircle2, Download, HardDrive, Trash2, WifiOff, X } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

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
    const [zoneName, setZoneName] = useState(currentResortName || 'Zona Esquí');
    const [activeTab, setActiveTab] = useState<'download' | 'manage'>('download');

    const handleStartDownload = () => {
        if (!zoneName.trim()) return;
        onDownloadCurrentArea(zoneName.trim());
    };

    return (
        <View className="absolute top-16 left-4 right-4 z-50 bg-slate-900/95 border border-slate-800 rounded-lg p-4 md:w-96 shadow-2xl space-y-4">
            {/* Cabecera */}
            <View className="flex-row justify-between items-center pb-2 border-b border-slate-800">
                <View className="flex-row items-center gap-2">
                    <WifiOff size={18} color="#60a5fa" />
                    <Text className="font-extrabold text-sm text-white">Mapas Offline</Text>
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
                        Descargar
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    className={`flex-1 py-1.5 rounded-md items-center ${activeTab === 'manage' ? 'bg-blue-600' : ''}`}
                    onPress={() => setActiveTab('manage')}
                >
                    <Text className={`text-xs font-bold ${activeTab === 'manage' ? 'text-white' : 'text-slate-400'}`}>
                        Zonas ({packs.length})
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Pestaña: Descargar Zona Actual */}
            {activeTab === 'download' && (
                <View className="space-y-3">
                    <Text className="text-xs text-slate-300">
                        Descarga las losetas vectoriales y las pistas de la zona visible para utilizarlas sin cobertura GPS/Red.
                    </Text>

                    <View className="space-y-1">
                        <Text className="text-[10px] font-bold text-slate-400 uppercase">Nombre de la Zona</Text>
                        <TextInput
                            value={zoneName}
                            onChangeText={setZoneName}
                            placeholder="Ej: Baqueira Beret"
                            placeholderTextColor="#64748b"
                            className="bg-slate-800 border border-slate-700 text-white rounded-md px-3 py-2 text-xs font-semibold"
                        />
                    </View>

                    {downloadingPack ? (
                        <View className="bg-slate-800/80 p-3 rounded-md border border-slate-700 space-y-2">
                            <View className="flex-row justify-between items-center">
                                <Text className="text-xs font-bold text-blue-400">Descargando {downloadingPack}...</Text>
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
                            <Text className="text-xs font-bold text-white">Guardar Zona Actual</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* Pestaña: Gestionar Zonas Guardadas */}
            {activeTab === 'manage' && (
                <ScrollView className="max-h-60 space-y-2">
                    {packs.length === 0 ? (
                        <View className="py-6 items-center justify-center">
                            <HardDrive size={32} color="#475569" />
                            <Text className="text-xs text-slate-400 mt-2">No tienes zonas descargadas.</Text>
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
                                        <Text className="text-[10px] text-slate-400">Disponible Offline</Text>
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
    );
};