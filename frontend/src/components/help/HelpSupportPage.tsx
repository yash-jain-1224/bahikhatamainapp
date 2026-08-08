import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  HelpCircle, MessageCircle, Mail, Phone, FileQuestion,
  ChevronDown, ChevronUp, ExternalLink, Search, Send,
  Zap, Users, CreditCard, Package, BookOpen,
} from 'lucide-react';
import {
  Button, Input, Card, CardContent, CardHeader, CardTitle, Textarea,
} from '@/components/ui';
import toast from 'react-hot-toast';

// Content lives in public/locales/*/help.json — each entry here only names
// its `faq.<key>_q` / `faq.<key>_a` pair and its `categories.*` key.
const faqDefs = [
  { key: 'create_business', categoryKey: 'getting_started' },
  { key: 'switch_business', categoryKey: 'getting_started' },
  { key: 'record_purchase', categoryKey: 'purchases' },
  { key: 'create_sale', categoryKey: 'sales' },
  { key: 'record_payment', categoryKey: 'payments' },
  { key: 'low_stock', categoryKey: 'inventory' },
  { key: 'reports', categoryKey: 'reports' },
  { key: 'upgrade', categoryKey: 'billing' },
  { key: 'export', categoryKey: 'account' },
  { key: 'team', categoryKey: 'account' },
];

const categories = [
  { key: 'getting_started', icon: Zap, color: 'text-blue-400 bg-blue-500/10' },
  { key: 'purchases', icon: Package, color: 'text-purple-400 bg-purple-500/10' },
  { key: 'sales', icon: BookOpen, color: 'text-emerald-400 bg-emerald-500/10' },
  { key: 'payments', icon: CreditCard, color: 'text-amber-400 bg-amber-500/10' },
  { key: 'inventory', icon: Package, color: 'text-cyan-400 bg-cyan-500/10' },
  { key: 'reports', icon: BookOpen, color: 'text-pink-400 bg-pink-500/10' },
  { key: 'billing', icon: CreditCard, color: 'text-orange-400 bg-orange-500/10' },
  { key: 'account', icon: Users, color: 'text-indigo-400 bg-indigo-500/10' },
];

export default function HelpSupportPage() {
  const { t } = useTranslation(['help', 'common']);
  const [search, setSearch] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState({ subject: '', message: '' });
  const [sending, setSending] = useState(false);

  // Resolve translations up front so search filters what the user actually sees
  const faqs = faqDefs.map((f) => ({
    categoryKey: f.categoryKey,
    category: t(`help:categories.${f.categoryKey}`),
    question: t(`help:faq.${f.key}_q`),
    answer: t(`help:faq.${f.key}_a`),
  }));

  const filteredFaqs = faqs.filter((f) => {
    const matchSearch = !search || f.question.toLowerCase().includes(search.toLowerCase()) || f.answer.toLowerCase().includes(search.toLowerCase());
    const matchCategory = !activeCategory || f.categoryKey === activeCategory;
    return matchSearch && matchCategory;
  });

  const handleContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.subject.trim() || !contactForm.message.trim()) {
      return toast.error(t('help:fill_all_fields'));
    }
    // There is no support-ticket backend. The old handler faked a 1.5s send
    // and told the user "Message sent!" while discarding their text. Compose
    // a real email instead — same destination as the contact card below.
    const mailto = `mailto:support@bahikhata.in?subject=${encodeURIComponent(contactForm.subject.trim())}&body=${encodeURIComponent(contactForm.message.trim())}`;
    window.location.href = mailto;
    toast.success(t('help:opening_email', 'Opening your email app — press Send there to deliver the message.'));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto">
        <div className="h-16 w-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4">
          <HelpCircle className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold">{t('help:title')}</h2>
        <p className="text-muted-foreground mt-1">{t('help:subtitle')}</p>
      </div>

      {/* Search */}
      <div className="max-w-lg mx-auto">
        <Input
          icon={<Search className="h-4 w-4" />}
          placeholder={t('help:search_placeholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-center"
        />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {categories.slice(0, 4).map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(activeCategory === cat.key ? null : cat.key)}
            className={`flex items-center gap-2 p-3 rounded-lg border transition-all text-left text-sm font-medium ${
              activeCategory === cat.key
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border hover:border-primary/30 hover:bg-muted'
            }`}
          >
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${cat.color}`}>
              <cat.icon className="h-4 w-4" />
            </div>
            {t(`help:categories.${cat.key}`)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* FAQs */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileQuestion className="h-4 w-4" />
                {t('help:faq_title')}
                {activeCategory && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    {t(`help:categories.${activeCategory}`)}
                    <button className="ml-1" onClick={() => setActiveCategory(null)}>×</button>
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredFaqs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileQuestion className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>{t('help:no_faqs')}</p>
                  </div>
                ) : (
                  filteredFaqs.map((faq, idx) => (
                    <motion.div
                      key={idx}
                      initial={false}
                      className="border border-border rounded-lg overflow-hidden"
                    >
                      <button
                        onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1">
                          <span className="text-xs text-muted-foreground">{faq.category}</span>
                          <p className="text-sm font-medium mt-0.5">{faq.question}</p>
                        </div>
                        {expandedFaq === idx ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                      </button>
                      {expandedFaq === idx && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          className="px-4 pb-4"
                        >
                          <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
                        </motion.div>
                      )}
                    </motion.div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Contact & Links */}
        <div className="space-y-4">
          {/* Contact Form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                {t('help:contact_title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleContact} className="space-y-3">
                <div>
                  <Input
                    placeholder={t('help:subject_placeholder')}
                    value={contactForm.subject}
                    onChange={(e) => setContactForm(prev => ({ ...prev, subject: e.target.value }))}
                  />
                </div>
                <div>
                  <Textarea
                    placeholder={t('help:message_placeholder')}
                    rows={4}
                    value={contactForm.message}
                    onChange={(e) => setContactForm(prev => ({ ...prev, message: e.target.value }))}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={sending}>
                  <Send className="h-4 w-4 mr-2" />
                  {sending ? t('help:sending') : t('help:send_message')}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Contact Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('help:other_ways')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <a href="mailto:support@bahikhata.in" className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted transition-colors">
                <Mail className="h-5 w-5 text-blue-400" />
                <div>
                  <p className="text-sm font-medium">{t('help:email_label')}</p>
                  <p className="text-xs text-muted-foreground">support@bahikhata.in</p>
                </div>
              </a>
              <a href="tel:+911234567890" className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted transition-colors">
                <Phone className="h-5 w-5 text-emerald-400" />
                <div>
                  <p className="text-sm font-medium">{t('help:phone_label')}</p>
                  <p className="text-xs text-muted-foreground">+91 12345 67890</p>
                </div>
              </a>
              <a href="https://wa.me/911234567890" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted transition-colors">
                <MessageCircle className="h-5 w-5 text-green-400" />
                <div>
                  <p className="text-sm font-medium">{t('help:whatsapp_label')}</p>
                  <p className="text-xs text-muted-foreground">{t('help:whatsapp_desc')}</p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
