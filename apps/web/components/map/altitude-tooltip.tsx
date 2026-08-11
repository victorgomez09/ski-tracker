import { View, Text } from "react-native";

export const AltitudeTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        return (
            <View className="bg-slate-800 p-2 border border-slate-700 rounded-md shadow-md">
                <Text className="font-semibold text-blue-400 text-xs">
                    {`${Math.round(Number(payload[0].value))}m Altitude`}
                </Text>
            </View>
        );
    }
    return null;
};