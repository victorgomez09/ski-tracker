import { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";

export default function BottomTabs({ state, descriptors, navigation }: BottomTabBarProps) {
    return (
        <>
            {/* Mobile Bottom Dock Navigation */}
            <div className="dock bg-base-100 border-t border-base-200 shadow-lg lg:hidden h-16 px-4 z-40">
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
                        <button 
                            key={route.key} 
                            onClick={onPress} 
                            className={`flex flex-col items-center justify-center gap-1 transition-all ${
                                isFocused ? "text-primary font-semibold" : "text-base-content/50"
                            }`}
                        >
                            {descriptor.options.tabBarIcon?.({ 
                                focused: isFocused, 
                                color: isFocused ? 'var(--color-primary)' : 'currentColor', 
                                size: 18 
                            })}
                            <span className="text-[10px] tracking-tight">{descriptor.options.title}</span>
                        </button>
                    )
                })}
            </div>

            {/* Desktop Left Sidebar Navigation */}
            <div className="hidden lg:flex flex-col w-64 bg-base-100 border-r border-base-200 h-screen fixed left-0 top-0 bottom-0 py-6 px-4 shrink-0 shadow-sm justify-between z-40">
                <div className="space-y-6">
                    {/* Brand header */}
                    <div className="flex items-center gap-2.5 px-3 py-1">
                        <div className="w-9 h-9 rounded-xl bg-linear-to-tr from-primary to-secondary flex items-center justify-center text-primary-content shadow-md shadow-primary/20">
                            <span className="font-extrabold text-xl tracking-tight">S</span>
                        </div>
                        <div>
                            <h1 className="font-extrabold text-base tracking-tight text-base-content">SkiTracker</h1>
                            <p className="text-[9px] text-base-content/40 font-bold uppercase tracking-wider">Enterprise Panel</p>
                        </div>
                    </div>

                    {/* Navigation Links */}
                    <nav className="space-y-1">
                        {state.routes.map((route, index) => {
                            const isFocused = state.index === index;
                            const descriptor = descriptors[route.key];
                            // if (route.name === 'tracking') return;

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
                                <button 
                                    key={route.key} 
                                    onClick={onPress} 
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
                                        isFocused 
                                        ? "bg-primary text-primary-content shadow-md shadow-primary/10" 
                                        : "text-base-content/70 hover:bg-base-200/80 hover:text-base-content"
                                    }`}
                                >
                                    {descriptor.options.tabBarIcon?.({ 
                                        focused: isFocused, 
                                        color: isFocused ? 'currentColor' : 'currentColor', 
                                        size: 20 
                                    })}
                                    <span>{descriptor.options.title}</span>
                                </button>
                            )
                        })}
                    </nav>
                </div>

                {/* Footer Brand Info */}
                <div className="px-3 text-[11px] text-base-content/40 border-t border-base-200 pt-4 flex flex-col gap-0.5">
                    <p className="font-medium">v1.0.0</p>
                    <p>© 2026 SkiTracker Inc.</p>
                </div>
            </div>
        </>
    )
}