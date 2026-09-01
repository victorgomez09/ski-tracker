import React, { createContext, useContext, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react-native';
import { useThemeColors, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/theme';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  fadeAnim: Animated.Value;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const colors = useThemeColors();

  const removeToast = useCallback((id: string, fadeAnim: Animated.Value) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    });
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration?: number) => {
    const id = Math.random().toString(36).substring(2, 9);
    const fadeAnim = new Animated.Value(0);

    setToasts((prev) => [...prev, { id, message, type, fadeAnim }]);

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    const timeout = duration !== undefined ? duration : (type === 'error' ? 12000 : 4000);

    // Auto-remove after timeout
    setTimeout(() => {
      removeToast(id, fadeAnim);
    }, timeout);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <SafeAreaView style={styles.toastContainer} pointerEvents="box-none">
        {toasts.map((toast) => {
          let Icon = Info;
          let iconColor = colors.primary;
          
          if (toast.type === 'success') {
            Icon = CheckCircle2;
            iconColor = colors.success;
          } else if (toast.type === 'error') {
            Icon = AlertTriangle;
            iconColor = colors.danger;
          }

          return (
            <Animated.View
              key={toast.id}
              style={[
                styles.toastCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: toast.fadeAnim,
                  transform: [
                    {
                      translateY: toast.fadeAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-20, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.toastContent}>
                <Icon size={20} color={iconColor} style={styles.icon} />
                <Text style={[styles.toastText, { color: colors.textPrimary }]} numberOfLines={12}>
                  {toast.message}
                </Text>
                <TouchableOpacity onPress={() => removeToast(toast.id, toast.fadeAnim)} style={styles.closeButton}>
                  <X size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </Animated.View>
          );
        })}
      </SafeAreaView>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: SPACING.md,
    right: SPACING.md,
    zIndex: 9999,
    gap: 8,
  },
  toastCard: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    padding: 12,
    ...SHADOWS.md,
    width: '100%',
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 10,
  },
  toastText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  closeButton: {
    padding: 4,
    marginLeft: 8,
  },
});
