import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const DEFAULT_GROUP_IMAGE = require('../../assets/images/split-group-default.png');

type Props = {
  photoUrl?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Split group avatar — custom photo when set, otherwise the default group image.
 */
export function SplitGroupAvatar({ photoUrl, size = 48, style }: Props) {
  const radius = size / 2;
  const uri = photoUrl?.trim() || null;

  return (
    <View style={[{ width: size, height: size, borderRadius: radius, overflow: 'hidden' }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={160}
        />
      ) : (
        <View style={{ width: size, height: size }}>
          <Image
            source={DEFAULT_GROUP_IMAGE}
            style={{ width: size, height: size }}
            contentFit="cover"
          />
          {/* Soft overlay icon if the asset fails / for clarity on small sizes */}
          {size >= 40 ? (
            <LinearGradient
              colors={['transparent', 'rgba(15,23,42,0.18)']}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

/** Compact picker preview with camera badge affordance. */
export function SplitGroupAvatarPickerPreview({
  localUri,
  photoUrl,
  size = 72,
}: {
  localUri?: string | null;
  photoUrl?: string | null;
  size?: number;
}) {
  const uri = localUri?.trim() || photoUrl?.trim() || null;
  return (
    <View style={{ width: size, height: size }}>
      <SplitGroupAvatar photoUrl={uri} size={size} />
      <View style={[styles.badge, { borderRadius: 999 }]}>
        <MaterialIcons name="photo-camera" size={14} color="#fff" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
});
