import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';

interface FAQ {
  question: string;
  answer: string;
  category: string;
}

const faqs: FAQ[] = [
  {
    category: 'Getting Started',
    question: 'How do I create a new business?',
    answer: 'Go to the Business Settings and tap "Create Business". Fill in the required details and save.',
  },
  {
    category: 'Purchases',
    question: 'How do I record a purchase?',
    answer: 'Navigate to the Purchases tab and tap "+" to create a new purchase. Select the supplier, add items, and save.',
  },
  {
    category: 'Sales',
    question: 'How do I create a sale?',
    answer: 'Go to the Sales tab and tap "+" to create a new sale. Select the customer, add items, and complete the sale.',
  },
  {
    category: 'Payments',
    question: 'How do I record a payment?',
    answer: 'Go to More → Payments and tap "+" to record a payment. Select the party, enter the amount, and save.',
  },
  {
    category: 'Inventory',
    question: 'How do I add inventory items?',
    answer: 'Navigate to the Inventory tab and tap "+" to add new items with their details like name, unit, and stock level.',
  },
  {
    category: 'Inventory',
    question: 'What happens when stock is low?',
    answer: 'When an item falls below its minimum stock level, an alert appears on your Dashboard.',
  },
  {
    category: 'Reports',
    question: 'What reports are available?',
    answer: 'Bahi Khata offers Day Book, Trial Balance, Profit & Loss, Balance Sheet, and Outstanding reports.',
  },
  {
    category: 'Ledger',
    question: 'How does the ledger work?',
    answer: 'The ledger automatically tracks all debits and credits from your purchases, sales, and payments.',
  },
];

const categories = ['All', 'Getting Started', 'Purchases', 'Sales', 'Payments', 'Inventory', 'Reports', 'Ledger'];

export default function HelpScreen() {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState('All');

  const filteredFaqs = faqs.filter((f) => {
    const matchSearch =
      !search ||
      f.question.toLowerCase().includes(search.toLowerCase()) ||
      f.answer.toLowerCase().includes(search.toLowerCase());
    const matchCategory = activeCategory === 'All' || f.category === activeCategory;
    return matchSearch && matchCategory;
  });

  const toggleFaq = (idx: number) => {
    setExpandedFaq(expandedFaq === idx ? null : idx);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>Help & Support</Text>

        {/* Search */}
        <View style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search FAQs..."
            placeholderTextColor={colors.textTertiary}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Category Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.categoryChip,
                {
                  backgroundColor: activeCategory === cat ? colors.primary : colors.surfaceSecondary,
                  borderColor: activeCategory === cat ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setActiveCategory(cat)}
            >
              <Text
                style={[
                  styles.categoryText,
                  { color: activeCategory === cat ? '#fff' : colors.textSecondary },
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Contact */}
        <View style={[styles.card, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
          <Text style={[styles.cardTitle, { color: colors.primary }]}>Need More Help?</Text>
          <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
            Our support team is here to assist you with any questions.
          </Text>
          <View style={styles.contactButtons}>
            <TouchableOpacity
              style={[styles.contactBtn, { backgroundColor: colors.primary }]}
              onPress={() => Linking.openURL('mailto:support@bahikhata.app')}
            >
              <Text style={styles.contactBtnText}>📧 Email</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.contactBtn, { backgroundColor: colors.success }]}
              onPress={() => Linking.openURL('https://wa.me/919876543210')}
            >
              <Text style={styles.contactBtnText}>💬 WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* FAQs */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Frequently Asked Questions ({filteredFaqs.length})
        </Text>
        {filteredFaqs.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
            <Text style={{ fontSize: 48, marginBottom: Spacing.md }}>🔍</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No FAQs found</Text>
          </View>
        ) : (
          filteredFaqs.map((faq, idx) => (
            <TouchableOpacity
              key={idx}
              style={[styles.faqCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => toggleFaq(idx)}
              activeOpacity={0.7}
            >
              <View style={styles.faqHeader}>
                <Text style={[styles.faqQuestion, { color: colors.text, flex: 1 }]}>{faq.question}</Text>
                <Text style={[styles.chevron, { color: colors.textTertiary }]}>
                  {expandedFaq === idx ? '▲' : '▼'}
                </Text>
              </View>
              {expandedFaq === idx && (
                <View style={[styles.faqAnswerContainer, { borderTopColor: colors.border }]}>
                  <Text style={[styles.faqCategory, { color: colors.primary }]}>{faq.category}</Text>
                  <Text style={[styles.faqAnswer, { color: colors.textSecondary }]}>{faq.answer}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  title: { fontSize: FontSize.xxl, fontWeight: '700', marginBottom: Spacing.lg },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  searchIcon: { fontSize: 18, marginRight: Spacing.sm },
  searchInput: { flex: 1, fontSize: FontSize.md, padding: 0 },
  categoryScroll: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  categoryChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  categoryText: { fontSize: FontSize.sm, fontWeight: '500' },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  cardTitle: { fontSize: FontSize.lg, fontWeight: '700', marginBottom: Spacing.sm },
  cardDesc: { fontSize: FontSize.sm, lineHeight: 20, marginBottom: Spacing.lg },
  contactButtons: { flexDirection: 'row', gap: Spacing.sm },
  contactBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  contactBtnText: { color: '#FFF', fontWeight: '600', fontSize: FontSize.sm },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', marginBottom: Spacing.md },
  faqCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  faqQuestion: { fontSize: FontSize.md, fontWeight: '600' },
  chevron: { fontSize: FontSize.sm, marginLeft: Spacing.sm },
  faqAnswerContainer: {
    padding: Spacing.lg,
    paddingTop: 0,
    borderTopWidth: 1,
    marginTop: 0,
  },
  faqCategory: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
  },
  faqAnswer: { fontSize: FontSize.sm, lineHeight: 20 },
  emptyState: {
    padding: Spacing.xxl,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  emptyText: { fontSize: FontSize.md },
});
