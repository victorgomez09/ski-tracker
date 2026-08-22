import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

interface LegendDetailPanelProps {
    onClose: () => void;
}

export const LegendDetailPanel: React.FC<LegendDetailPanelProps> = ({ onClose }) => {
    const { t } = useTranslation();
    const isWeb = Platform.OS === 'web';

    const getDifficultyMeta = [
        { label: t('novice'), slope: '< 10°', bg: 'bg-[#00a859]' },
        { label: t('easy'), slope: '10° - 14º', bg: 'bg-[#0072bc]' },
        { label: t('intermediate'), slope: '15° - 24°', bg: 'bg-[#f0141e]' },
        { label: t('expert'), slope: '> 24°', bg: 'bg-black' },
        { label: t('other'), slope: '-', bg: 'bg-gray-400' },
    ];

    return (
        <View className="absolute inset-0 bg-black/60 z-50 p-3">
            <View className={`bg-slate-900 border border-slate-700 shadow-md p-4 rounded-xl ${isWeb ? 'w-11/12 h-11/12' : 'w-full h-full'} flex`}>
                <View className="flex-row justify-between items-center mb-3">
                    <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        {t('legend')}
                    </Text>
                    <TouchableOpacity
                        onPress={onClose}
                        className="p-1 rounded-full bg-slate-800"
                    >
                        <X size={18} color="#94a3b8" />
                    </TouchableOpacity>
                </View>

                <ScrollView className="flex flex-col gap-4">
                    <View className="bg-slate-800 p-3.5 rounded-md border border-slate-700 space-y-2">
                        <Text className="text-xs font-bold text-slate-300 mb-2">{t('difficulty_levels')}</Text>
                        {getDifficultyMeta.map((meta) => (
                            <View key={meta.label} className="flex-row items-center my-1">
                                <View className={`w-4 h-4 ${meta.bg} rounded-sm mr-3`} />
                                <Text className="text-xs font-semibold text-white">{meta.label}</Text>
                            </View>
                        ))}
                    </View>

                    <View className="bg-slate-800 p-3.5 rounded-md border border-slate-700 mt-4">
                        <Text className="text-xs font-bold text-slate-300 mb-2">
                            {t('slope_grading')}
                        </Text>

                        <View className="flex-row flex-wrap items-center justify-center gap-2">
                            {getDifficultyMeta.filter(meta => meta.label !== t('other')).map((meta) => (
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

