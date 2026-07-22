import { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";

export default function BottomTabs({ state, descriptors, navigation }: BottomTabBarProps) {
    return (
        <div className="dock bg-base-300">
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

                return (
                    <button key={route.key} onClick={onPress} className={isFocused ? "dock-active" : ""}>
                        {descriptor.options.tabBarIcon?.({ focused: isFocused, color: '#9ca3af', size: 10 })}
                        <span className="dock-label">{descriptor.options.title}</span>
                    </button>
                )
            })}
        </div>
    )
}