// =============================================================================
// Pehchaan Agent - Entity Resolution (Fuzzy + Vector Search)
// =============================================================================

import {
  EntityMatch,
  EntityResolutionResult,
  ConversationState,
} from '../types';
import { config } from '../config';

export class PehchaanAgent {
  // ─── Resolve Entity ────────────────────────────────────────────────────────
  async resolveEntity(
    query: string,
    context: ConversationState
  ): Promise<EntityResolutionResult> {
    const normalizedQuery = this.normalizePartyName(query);

    // Step 1: Check user's learned entity mappings
    const learnedMapping = context.preferences.entityMappings[normalizedQuery];
    if (learnedMapping) {
      // Check if auto-apply threshold reached
      const learning = context.preferences.learningData.find(
        l => l.input === normalizedQuery && l.autoApply
      );
      if (learning) {
        return {
          resolved: true,
          matches: [{ id: learning.resolvedTo, name: learnedMapping, type: 'both', score: 1.0, metadata: { recentTransactions: 0 } }],
          selectedMatch: { id: learning.resolvedTo, name: learnedMapping, type: 'both', score: 1.0, metadata: { recentTransactions: 0 } },
          needsClarification: false,
        };
      }
    }

    // Step 2: Search parties in database
    const matches = await this.searchParties(normalizedQuery, context.tenantId);

    // Step 3: Rank by relevance + recency
    const rankedMatches = this.rankMatches(matches, context);

    // Step 4: Determine if clarification needed
    if (rankedMatches.length === 0) {
      return {
        resolved: false,
        matches: [],
        needsClarification: true,
        clarificationMessage: `"${query}" naam ki koi party nahi mili.\n\nNayi party add karni hai?`,
      };
    }

    if (rankedMatches.length === 1 && rankedMatches[0].score > 0.85) {
      return {
        resolved: true,
        matches: rankedMatches,
        selectedMatch: rankedMatches[0],
        needsClarification: false,
      };
    }

    // Multiple matches - need clarification
    const matchList = rankedMatches
      .map((m, i) => `${i + 1}. ${m.name}${m.metadata.city ? ` (${m.metadata.city})` : ''}`)
      .join('\n');

    return {
      resolved: false,
      matches: rankedMatches,
      needsClarification: true,
      clarificationMessage: `"${query}" naam ki ${rankedMatches.length} party mili:\n\n${matchList}\n\nKaunsi party hai? Number bhejein.`,
    };
  }

  // ─── Search Parties ────────────────────────────────────────────────────────
  private async searchParties(query: string, tenantId: string): Promise<EntityMatch[]> {
    // Try Azure AI Search first (vector + semantic)
    const azureSearchResults = await this.searchWithAzureAI(query, tenantId);
    if (azureSearchResults.length > 0) return azureSearchResults;

    // Fallback: Fuzzy database search
    return this.fuzzyDatabaseSearch(query, tenantId);
  }

  // ─── Azure AI Search (Vector + Semantic) ───────────────────────────────────
  private async searchWithAzureAI(query: string, tenantId: string): Promise<EntityMatch[]> {
    const endpoint = config.azure.search.endpoint;
    const apiKey = config.azure.search.apiKey;

    if (!endpoint || !apiKey) return [];

    // Fail closed: without a real tenant, an empty/omitted filter would search
    // across ALL tenants' entities.
    if (!tenantId) return [];

    try {
      const axios = (await import('axios')).default;
      // OData string literals escape single quotes by doubling them — never
      // interpolate the raw value into the filter expression.
      const safeTenantId = tenantId.replace(/'/g, "''");
      const response = await axios.post(
        `${endpoint}/indexes/${config.azure.search.indexName}/docs/search?api-version=2024-07-01`,
        {
          search: query,
          queryType: 'semantic',
          semanticConfiguration: 'default',
          filter: `tenantId eq '${safeTenantId}'`,
          top: 10,
          select: 'id,name,type,city,gstin,phone,recentTransactionCount,lastTransactionDate',
        },
        { headers: { 'api-key': apiKey, 'Content-Type': 'application/json' } }
      );

      return (response.data.value || []).map((hit: any) => ({
        id: hit.id,
        name: hit.name,
        type: hit.type || 'both',
        score: hit['@search.score'] || 0.5,
        metadata: {
          city: hit.city,
          gstin: hit.gstin,
          phone: hit.phone,
          recentTransactions: hit.recentTransactionCount || 0,
          lastTransactionDate: hit.lastTransactionDate,
        },
      }));
    } catch (error) {
      console.warn('Azure AI Search error:', (error as Error).message);
      return [];
    }
  }

  // ─── Fuzzy Database Search ─────────────────────────────────────────────────
  private async fuzzyDatabaseSearch(query: string, _tenantId: string): Promise<EntityMatch[]> {
    // Generate fuzzy variants for Hindi transliteration
    const variants = this.generateFuzzyVariants(query);

    // This would normally query the database
    // For now, return empty - will be connected to Prisma
    console.log(`🔍 Fuzzy search for: ${variants.join(', ')}`);
    return [];
  }

  // ─── Rank Matches ──────────────────────────────────────────────────────────
  private rankMatches(matches: EntityMatch[], context: ConversationState): EntityMatch[] {
    return matches
      .map(match => {
        let boostedScore = match.score;

        // Boost if in frequent vendors/customers
        if (context.preferences.frequentVendors.includes(match.name) ||
            context.preferences.frequentCustomers.includes(match.name)) {
          boostedScore += 0.15;
        }

        // Boost if recently used
        if (context.context.recentParties.includes(match.id)) {
          boostedScore += 0.1;
        }

        // Boost by transaction frequency
        if (match.metadata.recentTransactions > 10) {
          boostedScore += 0.05;
        }

        return { ...match, score: Math.min(boostedScore, 1.0) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  // ─── Normalize Party Name ──────────────────────────────────────────────────
  private normalizePartyName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\b(ji|bhai|seth|sahab|sir|madam)\b/gi, '')
      .replace(/\b(traders?|enterprises?|industries|pvt\.?\s*ltd\.?|limited)\b/gi, '')
      .trim();
  }

  // ─── Generate Fuzzy Variants (Hindi Transliteration) ───────────────────────
  private generateFuzzyVariants(query: string): string[] {
    const variants = [query];
    const normalized = query.toLowerCase();

    // Common Hindi-English transliteration variants
    const replacements: Record<string, string[]> = {
      'a': ['aa', 'e'],
      'sh': ['s', 'ch'],
      'v': ['w', 'b'],
      'ph': ['f'],
      'th': ['t'],
      'dh': ['d'],
      'bh': ['b'],
      'gh': ['g'],
      'kh': ['k'],
      'ee': ['i'],
      'oo': ['u'],
      'ai': ['e', 'ay'],
      'au': ['o', 'aw'],
    };

    for (const [from, toList] of Object.entries(replacements)) {
      if (normalized.includes(from)) {
        for (const to of toList) {
          variants.push(normalized.replace(from, to));
        }
      }
    }

    return [...new Set(variants)];
  }
}
