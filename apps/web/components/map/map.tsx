import React from 'react';
import { Platform } from 'react-native';

let MapComponent: React.ComponentType<any>;

// if (Platform.OS === 'web') {
//     MapComponent = require('./map.web').default;
// } else {
    MapComponent = require('./map.native').default;
// }

export default function InteractiveSkiMap(props: any) {
    return <MapComponent {...props} />;
}