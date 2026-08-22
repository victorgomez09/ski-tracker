import { View, Text } from "react-native";

export const SpeedTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        return (
            <View className="bg-slate-800 p-2 border border-slate-700 rounded-md shadow-md">
                <Text className="font-semibold text-red-400 text-xs">
                    {`${Number(payload[0].value).toFixed(1)} km/h Speed`}
                </Text>
            </View>
        );
    }
    return null;
};