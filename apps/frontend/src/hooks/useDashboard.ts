'use client';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api';

export interface DashboardStats {
  todaySales: number;
  todayTransactions: number;
  totalProducts: number;
  lowStockCount: number;
  totalDue: number;
  monthSales: number;
  monthGrowth: number;
  recentSales: RecentSale[];
  salesChartData: ChartPoint[];
  topProducts: TopProduct[];
}

export interface RecentSale {
  id: string;
  invoiceNumber: string;
  customerName?: string;
  totalAmount: string;
  paidAmount: string;
  paymentStatus: string;
  saleDate: string;
}

export interface ChartPoint {
  date: string;
  sales: number;
  transactions: number;
}

export interface TopProduct {
  name: string;
  nameBn?: string;
  sku: string;
  totalSold: number;
  revenue: number;
}

async function fetchDashboardStats(): Promise<DashboardStats> {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split('T')[0];
  const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split('T')[0];

  // Parallel requests
  const [todaySalesRes, monthSalesRes, productsRes, recentSalesRes] = await Promise.allSettled([
    apiClient.get('/sales', { params: { from: todayStr, to: todayStr, limit: 1 } }),
    apiClient.get('/sales', { params: { from: monthStart, limit: 1 } }),
    apiClient.get('/products', { params: { limit: 1 } }),
    apiClient.get('/sales', { params: { limit: 5 } }),
  ]);

  // Safely extract values
  const todayMeta = todaySalesRes.status === 'fulfilled' ? todaySalesRes.value.data.meta : null;
  const monthMeta = monthSalesRes.status === 'fulfilled' ? monthSalesRes.value.data.meta : null;
  const productMeta = productsRes.status === 'fulfilled' ? productsRes.value.data.meta : null;
  const recentData = recentSalesRes.status === 'fulfilled' ? recentSalesRes.value.data.data : [];

  // Get today's sales total from data
  let todaySalesTotal = 0;
  if (todaySalesRes.status === 'fulfilled') {
    const salesToday = await apiClient.get('/sales', { params: { from: todayStr, to: todayStr, limit: 100 } });
    todaySalesTotal = salesToday.data.data?.reduce(
      (sum: number, s: any) => sum + parseFloat(s.totalAmount || '0'), 0
    ) ?? 0;
  }

  // Build 7-day chart data from recent sales (mock structure from available data)
  const salesChartData: ChartPoint[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      date: d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
      sales: Math.random() * 5000 + 500, // placeholder until dedicated endpoint
      transactions: Math.floor(Math.random() * 15 + 2),
    };
  });

  // Map recent sales
  const recentSales: RecentSale[] = (recentData ?? []).map((s: any) => ({
    id: s.id,
    invoiceNumber: s.invoiceNumber,
    customerName: s.customer?.name,
    totalAmount: s.totalAmount,
    paidAmount: s.paidAmount,
    paymentStatus: s.paymentStatus,
    saleDate: s.saleDate,
  }));

  return {
    todaySales: todaySalesTotal,
    todayTransactions: todayMeta?.total ?? 0,
    totalProducts: productMeta?.total ?? 0,
    lowStockCount: 0,
    totalDue: 0,
    monthSales: 0,
    monthGrowth: 0,
    recentSales,
    salesChartData,
    topProducts: [],
  };
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: fetchDashboardStats,
    refetchInterval: 60_000, // refresh every 60s
    staleTime: 30_000,
  });
}
