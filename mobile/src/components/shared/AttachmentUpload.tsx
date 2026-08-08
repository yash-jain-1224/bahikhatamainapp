import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import DocumentPicker, { types, DocumentPickerResponse } from 'react-native-document-picker';
import { launchImageLibrary, launchCamera, Asset } from 'react-native-image-picker';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import Icon from 'react-native-vector-icons/Feather';

export interface Attachment {
  id: string;
  name: string;
  type: string;
  uri: string;
  size?: number;
  uploadedAt?: Date;
}

interface AttachmentUploadProps {
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  maxAttachments?: number;
  maxFileSize?: number; // in bytes
  allowedTypes?: ('image' | 'document' | 'pdf' | 'all')[];
  onUpload?: (attachment: Attachment) => Promise<string>; // Returns uploaded URL
  disabled?: boolean;
}

const FILE_TYPE_ICONS: Record<string, string> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'application/pdf': 'file-text',
  'application/msword': 'file-text',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'file-text',
  'application/vnd.ms-excel': 'grid',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'grid',
  'text/csv': 'grid',
  'text/plain': 'file-text',
  default: 'file',
};

function getFileIcon(mimeType: string): string {
  return FILE_TYPE_ICONS[mimeType] || FILE_TYPE_ICONS.default;
}

function formatFileSize(bytes: number | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export default function AttachmentUpload({
  attachments,
  onAttachmentsChange,
  maxAttachments = 5,
  maxFileSize = 10 * 1024 * 1024, // 10MB default
  allowedTypes = ['all'],
  onUpload,
  disabled = false,
}: AttachmentUploadProps) {
  const { colors } = useTheme();
  const [showPicker, setShowPicker] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const canAddMore = attachments.length < maxAttachments;

  const handlePickDocument = async () => {
    try {
      setShowPicker(false);

      const docTypes: string[] = [];
      if (allowedTypes.includes('all') || allowedTypes.includes('document')) {
        docTypes.push(types.doc, types.docx, types.xls, types.xlsx, types.csv, types.plainText);
      }
      if (allowedTypes.includes('all') || allowedTypes.includes('pdf')) {
        docTypes.push(types.pdf);
      }
      if (allowedTypes.includes('all') || allowedTypes.includes('image')) {
        docTypes.push(types.images);
      }

      const result = await DocumentPicker.pick({
        type: docTypes.length > 0 ? docTypes : [types.allFiles],
        copyTo: 'cachesDirectory',
        allowMultiSelection: true,
      });

      await processFiles(result);
    } catch (error) {
      if (!DocumentPicker.isCancel(error)) {
        Alert.alert('Error', 'Failed to pick document');
      }
    }
  };

  const handleTakePhoto = async () => {
    setShowPicker(false);
    
    const result = await launchCamera({
      mediaType: 'photo',
      quality: 0.8,
      includeBase64: false,
    });

    if (result.assets && result.assets.length > 0) {
      await processImageAssets(result.assets);
    }
  };

  const handlePickImage = async () => {
    setShowPicker(false);

    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
      selectionLimit: maxAttachments - attachments.length,
    });

    if (result.assets && result.assets.length > 0) {
      await processImageAssets(result.assets);
    }
  };

  const processImageAssets = async (assets: Asset[]) => {
    const newAttachments: Attachment[] = [];

    for (const asset of assets) {
      if (!asset.uri) continue;

      // Check file size
      if (asset.fileSize && asset.fileSize > maxFileSize) {
        Alert.alert('File Too Large', `${asset.fileName} exceeds the maximum file size of ${formatFileSize(maxFileSize)}`);
        continue;
      }

      const attachment: Attachment = {
        id: generateId(),
        name: asset.fileName || `image_${Date.now()}.jpg`,
        type: asset.type || 'image/jpeg',
        uri: asset.uri,
        size: asset.fileSize,
        uploadedAt: new Date(),
      };

      if (onUpload) {
        setUploading(attachment.id);
        try {
          const uploadedUrl = await onUpload(attachment);
          attachment.uri = uploadedUrl;
        } catch {
          Alert.alert('Upload Failed', `Failed to upload ${attachment.name}`);
          continue;
        } finally {
          setUploading(null);
        }
      }

      newAttachments.push(attachment);
    }

    if (newAttachments.length > 0) {
      onAttachmentsChange([...attachments, ...newAttachments].slice(0, maxAttachments));
    }
  };

  const processFiles = async (files: DocumentPickerResponse[]) => {
    const newAttachments: Attachment[] = [];

    for (const file of files) {
      // Check file size
      if (file.size && file.size > maxFileSize) {
        Alert.alert('File Too Large', `${file.name} exceeds the maximum file size of ${formatFileSize(maxFileSize)}`);
        continue;
      }

      const attachment: Attachment = {
        id: generateId(),
        name: file.name || `file_${Date.now()}`,
        type: file.type || 'application/octet-stream',
        uri: file.fileCopyUri || file.uri,
        size: file.size ?? undefined,
        uploadedAt: new Date(),
      };

      if (onUpload) {
        setUploading(attachment.id);
        try {
          const uploadedUrl = await onUpload(attachment);
          attachment.uri = uploadedUrl;
        } catch {
          Alert.alert('Upload Failed', `Failed to upload ${attachment.name}`);
          continue;
        } finally {
          setUploading(null);
        }
      }

      newAttachments.push(attachment);
    }

    if (newAttachments.length > 0) {
      onAttachmentsChange([...attachments, ...newAttachments].slice(0, maxAttachments));
    }
  };

  const handleRemove = (id: string) => {
    Alert.alert(
      'Remove Attachment',
      'Are you sure you want to remove this attachment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            onAttachmentsChange(attachments.filter((a) => a.id !== id));
          },
        },
      ]
    );
  };

  const handlePreview = async (attachment: Attachment) => {
    // For images, show a preview. For documents, try to open with system handler
    if (attachment.type.startsWith('image/')) {
      // Could show full-screen image preview
      Alert.alert('Preview', attachment.name);
    } else {
      try {
        const supported = await Linking.canOpenURL(attachment.uri);
        if (supported) {
          await Linking.openURL(attachment.uri);
        } else {
          Alert.alert('Cannot Open', 'Unable to open this file type');
        }
      } catch {
        Alert.alert('Error', 'Failed to open file');
      }
    }
  };

  const renderAttachment = ({ item }: { item: Attachment }) => {
    const isUploading = uploading === item.id;
    const isImage = item.type.startsWith('image/');

    return (
      <TouchableOpacity
        style={[styles.attachmentItem, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
        onPress={() => handlePreview(item)}
        onLongPress={() => handleRemove(item.id)}
        disabled={isUploading}
      >
        {isImage ? (
          <Image source={{ uri: item.uri }} style={styles.thumbnail} resizeMode="cover" />
        ) : (
          <View style={[styles.fileIcon, { backgroundColor: colors.primaryLight }]}>
            <Icon name={getFileIcon(item.type)} size={20} color={colors.primary} />
          </View>
        )}
        <View style={styles.attachmentInfo}>
          <Text style={[styles.attachmentName, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.size && (
            <Text style={[styles.attachmentSize, { color: colors.textTertiary }]}>
              {formatFileSize(item.size)}
            </Text>
          )}
        </View>
        {isUploading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <TouchableOpacity onPress={() => handleRemove(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="x" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Attachments list */}
      {attachments.length > 0 && (
        <FlatList
          data={attachments}
          keyExtractor={(item) => item.id}
          renderItem={renderAttachment}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.attachmentsList}
          style={styles.listContainer}
        />
      )}

      {/* Add attachment button */}
      {canAddMore && !disabled && (
        <TouchableOpacity
          style={[styles.addButton, { borderColor: colors.border }]}
          onPress={() => setShowPicker(true)}
        >
          <Icon name="paperclip" size={20} color={colors.primary} />
          <Text style={[styles.addButtonText, { color: colors.primary }]}>
            Add Attachment
          </Text>
          <Text style={[styles.attachmentCount, { color: colors.textTertiary }]}>
            ({attachments.length}/{maxAttachments})
          </Text>
        </TouchableOpacity>
      )}

      {/* Picker modal */}
      <Modal
        visible={showPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPicker(false)}
        >
          <View style={[styles.pickerSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Add Attachment</Text>

            <TouchableOpacity
              style={[styles.pickerOption, { borderBottomColor: colors.border }]}
              onPress={handleTakePhoto}
            >
              <View style={[styles.pickerIconContainer, { backgroundColor: colors.primaryLight }]}>
                <Icon name="camera" size={22} color={colors.primary} />
              </View>
              <Text style={[styles.pickerOptionText, { color: colors.text }]}>Take Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pickerOption, { borderBottomColor: colors.border }]}
              onPress={handlePickImage}
            >
              <View style={[styles.pickerIconContainer, { backgroundColor: colors.primaryLight }]}>
                <Icon name="image" size={22} color={colors.primary} />
              </View>
              <Text style={[styles.pickerOptionText, { color: colors.text }]}>Choose from Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pickerOption, { borderBottomColor: colors.border }]}
              onPress={handlePickDocument}
            >
              <View style={[styles.pickerIconContainer, { backgroundColor: colors.primaryLight }]}>
                <Icon name="file" size={22} color={colors.primary} />
              </View>
              <Text style={[styles.pickerOptionText, { color: colors.text }]}>Choose Document</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowPicker(false)}
            >
              <Text style={[styles.cancelButtonText, { color: colors.error }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  listContainer: {
    marginBottom: Spacing.md,
  },
  attachmentsList: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    minWidth: 180,
    maxWidth: 220,
    gap: Spacing.sm,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentInfo: {
    flex: 1,
  },
  attachmentName: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  attachmentSize: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: Spacing.sm,
  },
  addButtonText: {
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  attachmentCount: {
    fontSize: FontSize.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  pickerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  pickerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    gap: Spacing.md,
  },
  pickerIconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerOptionText: {
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  cancelButton: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  cancelButtonText: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
