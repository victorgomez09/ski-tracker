import {
    CameraType,
    CameraView,
    useCameraPermissions,
} from "expo-camera";
import { Image } from "expo-image";
import { CameraIcon, RotateCcw, X } from "lucide-react";
import { useRef, useState } from "react";
import { Pressable } from "react-native";

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
            <div className="flex flex-col items-center justify-center gap-4 bg-base-300 w-full h-full">
                <span className="text-lg font-semibold text-base-content">
                    We need your permission to use the camera
                </span>
                <button onClick={requestPermission} className="btn btn-primary">Grant permission</button>
            </div>
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
            <div className="flex flex-col items-center justify-center gap-4">
                <Image
                    source={{ uri }}
                    contentFit="contain"
                    style={{ width: 300, aspectRatio: 1 }}
                />
                <button onClick={() => setUri(null)} className="btn btn-primary">
                    Take another picture
                </button>
            </div>
        );
    };

    const renderCamera = () => {
        return (
            <div className="flex flex-col items-center justify-center gap-4 w-full h-full">
                <CameraView
                    ref={ref}
                    mode="picture"
                    facing={facing}
                    mute={false}
                    responsiveOrientationWhenOrientationLocked
                />
                <div className="flex flex-row items-center justify-center gap-4">
                    <Pressable onPress={takePicture}>
                        {({ pressed }) => (
                            <CameraIcon
                                style={{
                                    opacity: pressed ? 0.5 : 1,
                                }}
                            />
                        )}
                    </Pressable>
                    <Pressable onPress={toggleFacing}>
                        <RotateCcw size={32} />
                    </Pressable>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col items-center justify-center p-2 w-full h-full">
            <X onClick={onClose} size={32} className="absolute top-4 right-4 cursor-pointer text-base-content" />
            {uri ? renderPicture(uri) : renderCamera()}
        </div>
    );
}