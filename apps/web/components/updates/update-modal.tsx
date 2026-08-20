import { X } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';

interface Props {
    visible: boolean;
    forceUpdate: boolean;
    latestVersion: string;
    changelog: string[];
    onUpdate: () => void;
    onDismiss: () => void;
}

export const UpdateModal: React.FC<Props> = ({
    visible,
    forceUpdate,
    latestVersion,
    changelog,
    onUpdate,
    onDismiss,
}) => {
    const { t } = useTranslation();

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View className="bg-slate-900 border border-slate-700 shadow-md p-4 rounded-xl w-full h-full flex">
                <View className="flex-row justify-between items-center mb-3">
                    <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        {forceUpdate ? t('force_update') : t('new_version_available')}
                    </Text>
                    <TouchableOpacity
                        onPress={onDismiss}
                        className="p-1 rounded-full bg-slate-800"
                    >
                        <X size={18} color="#94a3b8" />
                    </TouchableOpacity>
                </View>
                <Text className="text-xs font-bold text-slate-300 mb-3">{t("version")} {latestVersion}</Text>

                <ScrollView className="space-y-4">
                    <View className="bg-slate-800 p-3.5 rounded-md border border-slate-700 space-y-2">
                        <Text className="text-xs font-bold text-slate-300 mb-2">
                            {t('changelogs')}
                        </Text>

                        <View className="flex-row flex-wrap gap-2">
                            {changelog.length > 0 && (
                                <View className="bg-slate-700 p-2 rounded-md border border-slate-600 w-full">
                                    <ScrollView style={{ maxHeight: 150 }} className="space-y-1">
                                        {changelog.map((item, index) => (
                                            <Text key={index} className="text-xs text-slate-300">
                                                • {item}
                                            </Text>
                                        ))}
                                    </ScrollView>
                                </View>
                            )}
                        </View>
                    </View>
                </ScrollView>

                <TouchableOpacity className="bg-blue-600 p-4 rounded-md items-center mt-6 shadow-md" onPress={onUpdate}>
                    <Text className="text-white font-bold text-base">{t('update')}</Text>
                </TouchableOpacity>

                {!forceUpdate && (
                    <TouchableOpacity className="bg-green-600 p-4 rounded-md items-center mt-6 shadow-md" onPress={onDismiss}>
                        <Text className="text-white font-bold text-base">{t('later')}</Text>
                    </TouchableOpacity>
                )}
            </View>
        </Modal>
    );
};