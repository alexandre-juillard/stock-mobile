import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Card, Chip, FAB, Searchbar, Text } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';
import { StockStatusBadge } from '@/components/ui/stock-status-badge';
import { useGetCategories } from '@/services/api/generated/catégories/catégories';
import type { CategoryResponse, StockItemResponse } from '@/services/api/generated/model';
import { getListStockItemsQueryOptions } from '@/services/api/generated/stock/stock';
import { mapErrorToUi } from '@/utils/error-mapper';

const ADD_PRODUCT_ROUTE = '/(tabs)/stock/form' as Href;

function buildStockItemRoute(stockItemId: string): Href {
  return `/(tabs)/stock/${stockItemId}` as Href;
}

export default function StockListScreen() {
  const router = useRouter();
  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false;

  const [searchQuery, setSearchQuery] = useState('');
  // Filtre multi-sélection : plusieurs catégories peuvent être cochées en même temps
  // (union des catégories cochées) — tableau vide = pas de filtre, on affiche tout.
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

  const stockItemsQuery = useQuery(getListStockItemsQueryOptions());
  const categoriesQuery = useGetCategories();

  const stockItems = useMemo(() => stockItemsQuery.data?.data ?? [], [stockItemsQuery.data]);
  const categories = useMemo(() => categoriesQuery.data?.data ?? [], [categoriesQuery.data]);

  const toggleCategory = useCallback((categoryId: string) => {
    setSelectedCategoryIds((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId]
    );
  }, []);

  const resetCategoryFilter = useCallback(() => setSelectedCategoryIds([]), []);

  const filteredStockItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return stockItems.filter((item) => {
      const matchesSearch = normalizedQuery
        ? (item.product?.name ?? '').toLowerCase().includes(normalizedQuery)
        : true;

      const matchesCategory =
        selectedCategoryIds.length === 0 ||
        (item.product?.category?.id ? selectedCategoryIds.includes(item.product.category.id) : false);

      return matchesSearch && matchesCategory;
    });
  }, [stockItems, searchQuery, selectedCategoryIds]);

  const handleRefresh = useCallback(() => {
    stockItemsQuery.refetch();
    categoriesQuery.refetch();
  }, [stockItemsQuery, categoriesQuery]);

  const isRefreshing = stockItemsQuery.isFetching || categoriesQuery.isFetching;

  const renderCategoryChip = useCallback(
    (category: CategoryResponse) => {
      if (!category.id) {
        return null;
      }

      const isSelected = selectedCategoryIds.includes(category.id);

      return (
        <Chip
          key={category.id}
          selected={isSelected}
          onPress={() => toggleCategory(category.id!)}
          style={[styles.categoryChip, isSelected && category.color ? { backgroundColor: category.color } : null]}
          mode={isSelected ? 'flat' : 'outlined'}>
          {category.name}
        </Chip>
      );
    },
    [selectedCategoryIds, toggleCategory]
  );

  const renderStockItem = useCallback(
    ({ item }: { item: StockItemResponse }) => {
      if (!item.id) {
        return null;
      }

      return (
        <Card style={styles.itemCard} onPress={() => router.push(buildStockItemRoute(item.id!))}>
          <Card.Content style={styles.itemContent}>
            <View style={styles.itemHeader}>
              <Text variant="titleMedium" style={styles.itemName}>
                {item.product?.name ?? 'Produit sans nom'}
              </Text>
              {item.status ? <StockStatusBadge status={item.status} /> : null}
            </View>
            <Text variant="bodyMedium" style={styles.itemQuantity}>
              {item.quantity ?? 0} {item.product?.baseUnit?.label ?? item.product?.baseUnit?.code ?? ''}
            </Text>
            {item.product?.category?.name ? (
              <Text variant="labelSmall" style={styles.itemCategory}>
                {item.product.category.name}
              </Text>
            ) : null}
          </Card.Content>
        </Card>
      );
    },
    [router]
  );

  const isInitialLoading = stockItemsQuery.isLoading || categoriesQuery.isLoading;
  const hasLoadError = stockItemsQuery.isError || categoriesQuery.isError;

  return (
    <ScreenShell title="Mon stock">
      {isOffline ? (
        <Text style={styles.offlineText}>
          Tu es hors ligne : dernières données synchronisées affichées.
        </Text>
      ) : null}

      <Searchbar
        placeholder="Rechercher un produit"
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={styles.searchbar}
      />

      {categories.length > 0 ? (
        <FlatList
          horizontal
          data={categories}
          keyExtractor={(category) => category.id ?? category.name ?? Math.random().toString()}
          renderItem={({ item }) => renderCategoryChip(item)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
          ListHeaderComponent={
            <Chip
              selected={selectedCategoryIds.length === 0}
              onPress={resetCategoryFilter}
              mode={selectedCategoryIds.length === 0 ? 'flat' : 'outlined'}
              style={styles.categoryChip}>
              Toutes
            </Chip>
          }
        />
      ) : null}

      {isInitialLoading ? (
        <View style={styles.centered}>
          <Text>Chargement de ton stock...</Text>
        </View>
      ) : hasLoadError ? (
        <View style={styles.centered}>
          <MaterialCommunityIcons name="alert-circle-outline" size={32} color="#D90429" />
          <Text style={styles.errorText}>
            {mapErrorToUi(stockItemsQuery.error ?? categoriesQuery.error).message}
          </Text>
        </View>
      ) : filteredStockItems.length === 0 ? (
        <View style={styles.centered}>
          <MaterialCommunityIcons name="fridge-outline" size={32} color="#60646C" />
          <Text style={styles.emptyText}>
            {stockItems.length === 0
              ? 'Ton garde-manger est vide pour le moment.'
              : "Aucun produit ne correspond à ta recherche."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredStockItems}
          keyExtractor={(item, index) => item.id ?? String(index)}
          renderItem={renderStockItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        />
      )}

      <FAB
        icon="plus"
        label="Ajouter un produit"
        style={styles.fab}
        onPress={() => router.push(ADD_PRODUCT_ROUTE)}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  offlineText: {
    opacity: 0.8,
  },
  searchbar: {
    elevation: 0,
  },
  categoryList: {
    gap: 8,
    paddingVertical: 4,
  },
  categoryChip: {
    marginRight: 8,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  errorText: {
    textAlign: 'center',
    color: '#D90429',
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.8,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: 8,
    paddingBottom: 96,
  },
  itemCard: {
    elevation: 1,
  },
  itemContent: {
    gap: 4,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemName: {
    flexShrink: 1,
  },
  itemQuantity: {
    opacity: 0.8,
  },
  itemCategory: {
    opacity: 0.6,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
});

