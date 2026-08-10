import {
    CameraType,
    CameraView,
    useCameraPermissions,
} from "expo-camera";
import { Image } from "expo-image";
import { Camera as CameraIcon, RotateCcw, X } from "lucide-react-native";
import { useRef, useState } from "react";
import { View, Text, TouchableOpacity, Pressable } from "react-native";

interface CameraProps {
    onClose?: () => void;
}

export const Camera = ({ onClose }: CameraProps) => {
    const [permission, requestPermission] = useCameraPermissions();
    const ref = useRef<CameraView>(null);
    const [uri, setUri] = useState<string | null>(null);
    const [facing, setFacing] = useState<CameraType>("back");

    if (!permission) {
        return null;
    }

    if (!permission.granted) {
        return (
            <View className="flex-1 items-center justify-center p-6 bg-slate-900">
                <Text className="text-lg font-semibold text-white text-center mb-4">
                    We need your permission to use the camera
                </Text>
                <TouchableOpacity onPress={requestPermission} className="bg-blue-600 px-6 py-3 rounded-xl">
                    <Text className="text-white font-bold text-base">Grant permission</Text>
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
            <View className="items-center justify-center space-y-4">
                <Image
                    source={{ uri }}
                    contentFit="contain"
                    style={{ width: 300, aspectRatio: 1, borderRadius: 16 }}
                />
                <TouchableOpacity onPress={() => setUri(null)} className="bg-blue-600 px-6 py-3 rounded-xl mt-4">
                    <Text className="text-white font-bold text-base">Take another picture</Text>
                </TouchableOpacity>
            </View>
        );
    };

    const renderCamera = () => {
        return (
            <View className="w-full h-full justify-center items-center">
                <CameraView
                    ref={ref}
                    style={{ width: '100%', height: '80%', borderRadius: 20 }}
                    mode="picture"
                    facing={facing}
                    mute={false}
                    responsiveOrientationWhenOrientationLocked
                />
                <View className="flex-row items-center justify-center gap-8 mt-4">
                    <Pressable onPress={takePicture} className="bg-blue-600 p-4 rounded-full">
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
                    <Pressable onPress={toggleFacing} className="bg-slate-800 p-4 rounded-full border border-slate-700">
                        <RotateCcw size={28} color="#ffffff" />
                    </Pressable>
                </View>
            </View>
        );
    };

    return (
        <View className="flex-1 items-center justify-center p-4 bg-slate-950 relative">
            <TouchableOpacity onPress={onClose} className="absolute top-6 right-6 z-50 p-2 bg-slate-800 rounded-full">
                <X size={28} color="#ffffff" />
            </TouchableOpacity>
            {uri ? renderPicture(uri) : renderCamera()}
        </View>
    );
};