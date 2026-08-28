import React from 'react';
import { Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

let ComponentToRender: React.ComponentType<any>;

if (Platform.OS === 'web') {
    ComponentToRender = () => <></>;
} else {
    ComponentToRender = require('../../components/tracking/tracking.native').default;
}

export default function InteractiveSkiMap(props: any) {
    return (
        <SafeAreaView
            edges={['top']}
            style={{ flex: 1, backgroundColor: 'transparent' }}
        >
            <ComponentToRender {...props} />
        </SafeAreaView>
    );
}