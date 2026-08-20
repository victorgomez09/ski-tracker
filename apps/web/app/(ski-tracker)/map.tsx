import { Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import '../../styles/global.css';

let MapComponent: React.ComponentType<any>;
if (Platform.OS === 'web') {
  MapComponent = require('../../components/map/map.web').default;
} else {
  MapComponent = require('../../components/map/map.native').default;
}

export default function MapView(props: any) {
  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: 'transparent' }}
    >
      <MapComponent {...props} />
    </SafeAreaView>
  );
}
