import {
    CameraType,
    CameraView,
    useCameraPermissions,
} from "expo-camera";
import { Image } from "expo-image";
import { Camera as CameraIcon, RotateCcw, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useRef, useState } from "react";
import { View, Text, TouchableOpacity, Pressable, StyleSheet } from "react-native";

import { COLORS, SPACING, BORDER_RADIUS, SHADOWS } from "../../constants/theme";

interface CameraProps {
    onClose?: () => void;
    onSavePhoto?: (uri: string) => void;
}

export const Camera = ({ onClose, onSavePhoto }: CameraProps) => {
    const { t } = useTranslation();
    const [permission, requestPermission] = useCameraPermissions();
    const ref = useRef<CameraView>(null);
    const [uri, setUri] = useState<string | null>(null);
    const [facing, setFacing] = useState<CameraType>("back");

    if (!permission) {
        return null;
    }

    if (!permission.granted) {
        return (
            <View style={styles.permissionContainer}>
                <Text style={styles.permissionText}>
                    {t('camera_permission_required', 'We need your permission to use the camera')}
                </Text>
                <TouchableOpacity onPress={requestPermission} style={styles.button}>
                    <Text style={styles.buttonText}>{t('grant_permission', 'Grant permission')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const takePicture = async () => {
        const photo = await ref.current?.takePictureAsync();
        if (photo?.uri) setUri(photo.uri);
    };

    const toggleFacing = () => {
        setFacing((prev) => (prev === "back" ? "front" : "back"));
    };

    const renderPicture = (uri: string) => {
        return (
            <View style={styles.pictureContainer}>
                <Image
                    source={{ uri }}
                    contentFit="contain"
                    style={styles.imagePreview}
                />
                <View style={styles.actionRow}>
                    <TouchableOpacity onPress={() => setUri(null)} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>{t('retake', 'Repetir')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={() => {
                            if (onSavePhoto) onSavePhoto(uri);
                            if (onClose) onClose();
                        }} 
                        style={styles.button}
                    >
                        <Text style={styles.buttonText}>{t('save_photo', 'Guardar Foto')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    const renderCamera = () => {
        return (
            <View style={styles.cameraWrapper}>
                <CameraView
                    ref={ref}
                    style={styles.cameraView}
                    mode="picture"
                    facing={facing}
                    mute={false}
                    responsiveOrientationWhenOrientationLocked
                />
                <View style={styles.shutterRow}>
                    <Pressable onPress={takePicture} style={styles.shutterButton}>
                        {({ pressed }) => (
                            <CameraIcon
                                color="#ffffff"
                                size={32}
                                style={{
                                    opacity: pressed ? 0.5 : 1,
                                }}
                            />
                        )}
                    </Pressable>
                    <Pressable onPress={toggleFacing} style={styles.switchButton}>
                        <RotateCcw size={28} color={COLORS.textSecondary} />
                    </Pressable>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <X size={28} color={COLORS.textSecondary} />
            </TouchableOpacity>
            {uri ? renderPicture(uri) : renderCamera()}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACING.md,
        backgroundColor: COLORS.background,
        position: 'relative',
    },
    permissionContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACING.lg,
        backgroundColor: COLORS.background,
    },
    permissionText: {
        fontSize: 18,
        fontWeight: '600',
        color: COLORS.textPrimary,
        textAlign: 'center',
        marginBottom: SPACING.md,
    },
    button: {
        backgroundColor: COLORS.primary,
        paddingHorizontal: SPACING.lg,
        paddingVertical: 12,
        borderRadius: BORDER_RADIUS.md,
        alignItems: 'center',
        justifyContent: 'center',
        ...SHADOWS.md,
    },
    buttonText: {
        color: COLORS.textOnPrimary,
        fontWeight: 'bold',
        fontSize: 16,
    },
    closeButton: {
        position: 'absolute',
        top: 24,
        right: 24,
        zIndex: 50,
        padding: 8,
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.round,
        ...SHADOWS.sm,
    },
    pictureContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        paddingHorizontal: SPACING.lg,
        gap: SPACING.md,
    },
    imagePreview: {
        width: 300,
        aspectRatio: 1,
        borderRadius: BORDER_RADIUS.xl,
    },
    actionRow: {
        flexDirection: 'row',
        gap: SPACING.md,
        marginTop: SPACING.lg,
        width: '100%',
        justifyContent: 'center',
    },
    secondaryButton: {
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
        paddingVertical: 12,
        borderRadius: BORDER_RADIUS.md,
        flex: 1,
        alignItems: 'center',
    },
    secondaryButtonText: {
        color: COLORS.textPrimary,
        fontWeight: 'bold',
        fontSize: 16,
    },
    cameraWrapper: {
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cameraView: {
        width: '100%',
        height: '80%',
        borderRadius: BORDER_RADIUS.xl,
    },
    shutterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        marginTop: SPACING.md,
    },
    shutterButton: {
        backgroundColor: COLORS.primary,
        padding: 16,
        borderRadius: BORDER_RADIUS.round,
        ...SHADOWS.md,
    },
    switchButton: {
        backgroundColor: COLORS.surface,
        padding: 16,
        borderRadius: BORDER_RADIUS.round,
        borderWidth: 1,
        borderColor: COLORS.border,
        ...SHADOWS.sm,
    },
});