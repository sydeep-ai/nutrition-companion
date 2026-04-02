import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const ACCENT = '#1D9E75';

export type MealCardLog = {
  photoUri?: string;
  note?: string;
  timestamp?: string;
};

type Props = {
  id: string;
  title: string;
  time: string;
  details?: string;
  checked: boolean;
  expanded: boolean;
  log?: MealCardLog;
  onToggleChecked: () => void;
  onToggleExpanded: () => void;
  onPhotoCaptured: (uri: string) => void;
  onDeletePhoto: () => void;
  onChangeNote: (text: string) => void;
};

export const MealCard: React.FC<Props> = ({
  title,
  time,
  details,
  checked,
  expanded,
  log,
  onToggleChecked,
  onToggleExpanded,
  onPhotoCaptured,
  onDeletePhoto,
  onChangeNote,
}) => {
  const splitTitle = (rawTitle: string) => {
    const match = rawTitle.match(/^(\S+)\s+(.*)$/);
    if (!match) {
      return { emoji: '', text: rawTitle };
    }
    return { emoji: match[1], text: match[2] };
  };

  const { emoji, text } = splitTitle(title);

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Camera access needed',
        'Please enable camera access in Settings to log meal photos.'
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const uri = result.assets[0]?.uri;
    if (uri) {
      onPhotoCaptured(uri);
    }
  };

  const handleChooseFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Photo library access needed',
        'Please enable photo library access in Settings to choose meal photos.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const uri = result.assets[0]?.uri;
    if (uri) {
      onPhotoCaptured(uri);
    }
  };

  const handleCameraButtonPress = () => {
    Alert.alert('Add Meal Photo', 'Choose an option', [
      { text: 'Take Photo', onPress: () => void handleTakePhoto() },
      { text: 'Choose from Gallery', onPress: () => void handleChooseFromGallery() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Pressable onPress={onToggleExpanded} style={styles.card}>
      <View style={styles.cardHeader}>
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onToggleChecked();
          }}
          style={[styles.checkbox, checked && styles.checkboxChecked]}
        >
          {checked ? <Text style={styles.checkmark}>✓</Text> : null}
        </Pressable>

        <View style={styles.headerTextWrap}>
          <View style={styles.mealTitleRow}>
            {emoji ? <Text style={styles.mealEmoji}>{emoji}</Text> : null}
            <Text style={[styles.mealTitle, checked && styles.mealTitleChecked]}>
              {text}
            </Text>
          </View>
          <Text style={styles.mealTime}>{time}</Text>
        </View>

        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            handleCameraButtonPress();
          }}
          style={styles.cameraButton}
        >
          <Text style={styles.cameraIcon}>📷</Text>
        </Pressable>
      </View>

      {expanded && !!details && <Text style={styles.details}>{details}</Text>}

      {expanded && (
        <View style={styles.logSection}>
          {log?.photoUri ? (
            <View style={styles.photoWrap}>
              <Image
                source={{ uri: log.photoUri }}
                style={styles.photo}
                resizeMode="cover"
              />
              <Pressable
                style={styles.deletePhotoButton}
                onPress={(e) => {
                  e.stopPropagation();
                  onDeletePhoto();
                }}
              >
                <Text style={styles.deletePhotoButtonText}>✕</Text>
              </Pressable>
            </View>
          ) : null}

          <TextInput
            style={styles.noteInput}
            placeholder="Add a quick note about this meal..."
            placeholderTextColor="#9CA3AF"
            value={log?.note ?? ''}
            onChangeText={onChangeNote}
            multiline
          />

          {log?.timestamp ? (
            <Text style={styles.timestamp}>
              Logged at {new Date(log.timestamp).toLocaleTimeString()}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#2E2E2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTextWrap: {
    flex: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: ACCENT,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  mealTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F3F4F6',
  },
  mealTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mealEmoji: {
    fontSize: 16,
  },
  mealTitleChecked: {
    textDecorationLine: 'line-through',
    color: '#9CA3AF',
  },
  mealTime: {
    marginTop: 2,
    fontSize: 13,
    color: '#9CA3AF',
  },
  cameraButton: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  cameraIcon: {
    fontSize: 14,
  },
  details: {
    marginTop: 10,
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 20,
  },
  logSection: {
    marginTop: 12,
  },
  photo: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    marginBottom: 8,
  },
  photoWrap: {
    position: 'relative',
  },
  deletePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deletePhotoButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  noteInput: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4B5563',
    backgroundColor: '#1F1F1F',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#F3F4F6',
  },
  timestamp: {
    marginTop: 4,
    fontSize: 11,
    color: '#9CA3AF',
  },
});

export default MealCard;

