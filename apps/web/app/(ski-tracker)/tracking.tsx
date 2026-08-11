import React from 'react';
import { Platform } from 'react-native';

let ComponentToRender: React.ComponentType<any>;

if (Platform.OS === 'web') {
    ComponentToRender = require('../../components/tracking/tracking.web').default;
    // ComponentToRender = require('../../components/tracking/tracking.native').default;
} else {
    ComponentToRender = require('../../components/tracking/tracking.native').default;
}

export default function InteractiveSkiMap(props: any) {
    return <ComponentToRender {...props} />;
}