import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { X } from 'lucide-react-native';

interface LegendDetailPanelProps {
    onClose: () => void;
}

const getDifficultyMeta = [
    { label: 'Novice', slope: '< 10°', bg: 'bg-[#00a859]', hex: '#00a859' },
    { label: 'Easy', slope: '10° - 14º', bg: 'bg-[#0072bc]', hex: '#0072bc' },
    { label: 'Intermediate', slope: '15° - 24°', bg: 'bg-[#f0141e]', hex: '#f0141e' },
    { label: 'Expert', slope: '> 24°', bg: 'bg-black', hex: '#000000' },
    { label: 'Other', slope: '-', bg: 'bg-gray-400', hex: '#9ca3af' },
];

export const LegendDetailPanel: React.FC<LegendDetailPanelProps> = ({ onClose }) => {
    const isWeb = Platform.OS === 'web';

    return (
        <View className="absolute inset-0 flex items-center justify-center bg-black/60 z-50 p-3">
            <View className={`bg-slate-900 border border-slate-700 shadow-md p-4 rounded-xl ${isWeb ? 'w-11/12 h-11/12' : 'w-full h-full'} flex`}>
                <View className="flex-row justify-between items-center mb-3">
                    <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Legend
                    </Text>
                    <TouchableOpacity
                        onPress={onClose}
                        className="p-1 rounded-full bg-slate-800"
                    >
                        <X size={18} color="#94a3b8" />
                    </TouchableOpacity>
                </View>

                <ScrollView className="space-y-4">
                    <View className="bg-slate-800 p-3.5 rounded-md border border-slate-700 space-y-2">
                        <Text className="text-xs font-bold text-slate-300 mb-2">Difficulty Levels</Text>
                        {getDifficultyMeta.map((meta) => (
                            <View key={meta.label} className="flex-row items-center my-1">
                                <View className={`w-4 h-4 ${meta.bg} rounded-sm mr-3`} />
                                <Text className="text-xs font-semibold text-white">{meta.label}</Text>
                            </View>
                        ))}
                    </View>

                    <View className="bg-slate-800 p-3.5 rounded-md border border-slate-700 space-y-2">
                        <Text className="text-xs font-bold text-slate-300 mb-2">
                            Downhill / Ski Tour Slope Grading
                        </Text>

                        <View className="flex-row flex-wrap gap-2">
                            {getDifficultyMeta.filter(meta => meta.label !== 'Other').map((meta) => (
                                <View key={meta.label} className="items-center mr-3 mb-2">
                                    <View className={`w-14 h-3 ${meta.bg} rounded-sm mb-1`} />
                                    <Text className="text-[10px] text-slate-300 text-center">{meta.slope}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                </ScrollView>
            </View>
        </View>
    );
};

