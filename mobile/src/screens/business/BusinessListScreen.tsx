import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { BusinessAvatar, Button } from '../../components/shared';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { setCurrentBusiness } from '../../store/businessSlice';
import type { Business } from '../../types';

export default function BusinessListScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const businesses = useAppSelector((s) => s.business.businesses);
  const currentBusiness = useAppSelector((s) => s.business.currentBusiness);

  const handleSelect = (business: Business) => {
    dispatch(setCurrentBusiness(business));
    navigation.goBack();
  };

  const renderItem = ({ item }: { item: Business }) => {
    const isSelected = item.id === currentBusiness?.id;
    return (
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: isSelected ? colors.primary + '08' : colors.card,
            borderColor: isSelected ? colors.primary : colors.border,
            ...Shadow.sm,
          },
        ]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.7}
      >
        <BusinessAvatar name={item.name} logoUrl={item.logo_url} size={48} />
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
          <Text style={[styles.type, { color: colors.textSecondary }]}>
            {item.type} {item.is_primary ? '• Primary' : ''}
          </Text>
          {item.address && (
            <Text style={[styles.address, { color: colors.textTertiary }]} numberOfLines={1}>
              {[item.city, item.state].filter(Boolean).join(', ')}
            </Text>
          )}
        </View>
        {isSelected && (
          <View style={[styles.checkmark, { backgroundColor: colors.primary }]}>
            <Text style={styles.checkText}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={businesses}
        renderItem={renderItem}
        keyExtractor={(item: Business) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          <Button
            title="+ Create New Business"
            variant="outline"
            onPress={() => navigation.navigate('BusinessCreate')}
            fullWidth
            style={{ marginTop: Spacing.lg }}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Spacing.lg, paddingBottom: 100 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    marginBottom: Spacing.md,
  },
  info: { flex: 1, marginLeft: Spacing.md },
  name: { fontSize: FontSize.md, fontWeight: '600' },
  type: { fontSize: FontSize.sm, marginTop: 2 },
  address: { fontSize: FontSize.xs, marginTop: 2 },
  checkmark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
