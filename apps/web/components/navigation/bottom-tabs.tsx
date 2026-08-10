import { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function BottomTabs({ state, descriptors, navigation }: BottomTabBarProps) {
    const isWeb = Platform.OS === 'web';

    return (
        <SafeAreaView edges={['bottom']} className="bg-slate-900 border-t border-slate-800 shadow-lg z-40">
            <View className="flex-row items-center justify-around h-16 px-2 bg-slate-900">
                {state.routes.map((route, index) => {
                    const isFocused = state.index === index;
                    const descriptor = descriptors[route.key];

                    const onPress = () => {
                        const event = navigation.emit({
                            type: 'tabPress',
                            target: route.key,
                            canPreventDefault: true,
                        });

                        if (!isFocused && !event.defaultPrevented) {
                            navigation.navigate(route.name);
                        }
                    };

                    const activeColor = "#3b82f6";
                    const inactiveColor = "#94a3b8";

                    return (
                        <TouchableOpacity
                            key={route.key}
                            onPress={onPress}
                            activeOpacity={0.7}
                            className="flex-1 items-center justify-center py-1.5"
                        >
                            {descriptor.options.tabBarIcon?.({
                                focused: isFocused,
                                color: isFocused ? activeColor : inactiveColor,
                                size: 20
                            })}
                            <Text
                                className={`text-[11px] font-semibold mt-1 ${
                                    isFocused ? "text-blue-500 font-bold" : "text-slate-400"
                                }`}
                            >
                                {descriptor.options.title}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </SafeAreaView>
    );
}