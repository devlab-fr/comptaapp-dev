import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface KPIGraphsProps {
  companyId: string;
}

interface MonthlyData {
  month: string;
  netResult: number;
  entriesCount: number;
  startDate: string;
  endDate: string;
}

interface CategoryData {
  category: string;
  amount: number;
  percentage: number;
  color: string;
  categoryId?: string;
}

export default function KPIGraphs({ companyId }: KPIGraphsProps) {
  const navigate = useNavigate();
  const [currentMonthData, setCurrentMonthData] = useState({ revenues: 0, expenses: 0 });
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyData[]>([]);
  const [expensesByCategory, setExpensesByCategory] = useState<CategoryData[]>([]);
  const [currentPeriod, setCurrentPeriod] = useState('');
  const [loading, setLoading] = useState(true);
  const [entriesCount, setEntriesCount] = useState({ revenues: 0, expenses: 0 });
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [totalEntriesCount, setTotalEntriesCount] = useState(0);
  const [monthsWithData, setMonthsWithData] = useState(0);

  useEffect(() => {
    loadKPIData();
  }, [companyId]);

  const loadKPIData = async () => {
    setLoading(true);
    await Promise.all([
      loadCurrentMonthData(),
      loadMonthlyTrend(),
      loadExpensesByCategory(),
    ]);
    setLoading(false);
  };

  const loadCurrentMonthData = async () => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const endDate = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];

    setCurrentPeriod(now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }));

    const [expensesRes, revenuesRes] = await Promise.all([
      supabase
        .from('expense_documents')
        .select('total_excl_vat')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate),
      supabase
        .from('revenue_documents')
        .select('total_excl_vat')
        .eq('company_id', companyId)
        .eq('accounting_status', 'validated')
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate),
    ]);

    const expenses = expensesRes.data?.reduce((sum, doc) => sum + Number(doc.total_excl_vat || 0), 0) || 0;
    const revenues = revenuesRes.data?.reduce((sum, doc) => sum + Number(doc.total_excl_vat || 0), 0) || 0;

    setCurrentMonthData({ expenses, revenues });
    setEntriesCount({
      expenses: expensesRes.data?.length || 0,
      revenues: revenuesRes.data?.length || 0,
    });
  };

  const loadExpensesByCategory = async () => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const endDate = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];

    const { data: documents } = await supabase
      .from('expense_documents')
      .select('id')
      .eq('company_id', companyId)
      .eq('accounting_status', 'validated')
      .gte('invoice_date', startDate)
      .lte('invoice_date', endDate);

    if (!documents || documents.length === 0) {
      setExpensesByCategory([]);
      return;
    }

    const documentIds = documents.map(d => d.id);

    const { data: lines } = await supabase
      .from('expense_lines')
      .select('category_id, amount_excl_vat')
      .in('document_id', documentIds);

    if (!lines || lines.length === 0) {
      setExpensesByCategory([]);
      return;
    }

    const { data: categories } = await supabase
      .from('expense_categories')
      .select('id, name');

    const categoryLookup = new Map(categories?.map(c => [c.id, c.name]) || []);
    const categoryIdLookup = new Map(categories?.map(c => [c.name, c.id]) || []);
    const categoryMap = new Map<string, number>();

    for (const line of lines) {
      const categoryName = categoryLookup.get(line.category_id) || 'Non catégorisé';
      const amount = Number(line.amount_excl_vat || 0);
      categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + amount);
    }

    const total = Array.from(categoryMap.values()).reduce((sum, val) => sum + val, 0);

    if (total === 0) {
      setExpensesByCategory([]);
      return;
    }

    const sortedCategories = Array.from(categoryMap.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: (amount / total) * 100,
        categoryId: categoryIdLookup.get(category),
      }))
      .sort((a, b) => b.amount - a.amount);

    const getCategoryColor = (categoryName: string): string => {
      const lowerName = categoryName.toLowerCase();
      if (lowerName.includes('achat') || lowerName.includes('marchandise') || lowerName.includes('matière')) {
        return '#2563eb';
      }
      if (lowerName.includes('service') || lowerName.includes('prestation') || lowerName.includes('honoraire')) {
        return '#8b5cf6';
      }
      if (lowerName.includes('charge') || lowerName.includes('fixe') || lowerName.includes('loyer') || lowerName.includes('location')) {
        return '#f59e0b';
      }
      if (lowerName === 'autres') {
        return '#6b7280';
      }
      return '#3b82f6';
    };

    const topCategories = sortedCategories.slice(0, 4);
    const others = sortedCategories.slice(4);

    if (others.length > 0) {
      const othersAmount = others.reduce((sum, cat) => sum + cat.amount, 0);
      topCategories.push({
        category: 'Autres',
        amount: othersAmount,
        percentage: (othersAmount / total) * 100,
        categoryId: undefined,
      });
    }

    setExpensesByCategory(
      topCategories.map((cat) => ({
        ...cat,
        color: getCategoryColor(cat.category),
      }))
    );
  };

  const loadMonthlyTrend = async () => {
    const months: MonthlyData[] = [];
    const now = new Date();
    let totalEntries = 0;
    let monthsWithEntries = 0;

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];

      const [expensesRes, revenuesRes] = await Promise.all([
        supabase
          .from('expense_documents')
          .select('total_excl_vat')
          .eq('company_id', companyId)
          .eq('accounting_status', 'validated')
          .gte('invoice_date', startDate)
          .lte('invoice_date', endDate),
        supabase
          .from('revenue_documents')
          .select('total_excl_vat')
          .eq('company_id', companyId)
          .eq('accounting_status', 'validated')
          .gte('invoice_date', startDate)
          .lte('invoice_date', endDate),
      ]);

      const expenses = expensesRes.data?.reduce((sum, doc) => sum + Number(doc.total_excl_vat || 0), 0) || 0;
      const revenues = revenuesRes.data?.reduce((sum, doc) => sum + Number(doc.total_excl_vat || 0), 0) || 0;
      const netResult = revenues - expenses;
      const entriesCount = (expensesRes.data?.length || 0) + (revenuesRes.data?.length || 0);

      totalEntries += entriesCount;
      if (entriesCount > 0) {
        monthsWithEntries++;
      }

      months.push({
        month: date.toLocaleDateString('fr-FR', { month: 'short' }),
        netResult,
        entriesCount,
        startDate,
        endDate,
      });
    }

    setMonthlyTrend(months);
    setTotalEntriesCount(totalEntries);
    setMonthsWithData(monthsWithEntries);
  };

  const hasData = currentMonthData.revenues > 0 || currentMonthData.expenses > 0 || monthlyTrend.some(m => m.netResult !== 0);

  if (loading) {
    return (
      <div style={{
        padding: '32px',
        backgroundColor: 'white',
        borderRadius: '16px',
        border: '1px solid #e5e7eb',
        marginBottom: '32px',
        textAlign: 'center',
      }}>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Chargement...</p>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div style={{
        padding: '40px',
        backgroundColor: 'white',
        borderRadius: '16px',
        border: '1px solid #e5e7eb',
        marginBottom: '32px',
        textAlign: 'center',
      }}>
        <h3 style={{
          margin: '0 0 8px 0',
          fontSize: '16px',
          fontWeight: '600',
          color: '#1a1a1a',
        }}>
          Vue synthèse
        </h3>
        <p style={{
          margin: 0,
          fontSize: '14px',
          color: '#6b7280',
        }}>
          Aucune donnée comptable disponible pour cette période
        </p>
      </div>
    );
  }

  const netResult = currentMonthData.revenues - currentMonthData.expenses;

  const getSituationBackground = (): string => {
    if (netResult > 0) return '#dcfce7';
    if (netResult < 0) return '#fee2e2';
    return '#f1f5f9';
  };

  const getSituationBorder = (): string => {
    if (netResult > 0) return '#86efac';
    if (netResult < 0) return '#fca5a5';
    return '#cbd5e1';
  };

  const getResultLabel = (): string => {
    const totalEntries = entriesCount.expenses + entriesCount.revenues;

    if (totalEntries === 0) {
      return "Aucune activité enregistrée";
    }

    if (netResult > 0) {
      return "Résultat positif";
    }

    if (netResult < 0) {
      return "Résultat négatif";
    }

    return "Résultat neutre";
  };

  const getPedagogicalMessage = (): string => {
    const totalEntries = entriesCount.expenses + entriesCount.revenues;

    if (totalEntries === 0) {
      return "Ajoutez un revenu ou une dépense pour visualiser votre situation.";
    }

    if (totalEntries <= 3) {
      return "Votre activité commence à se dessiner.";
    }

    return "Votre activité est en cours d'analyse.";
  };

  const minNetResult = Math.min(...monthlyTrend.map(m => m.netResult), 0);
  const maxNetResult = Math.max(...monthlyTrend.map(m => m.netResult), 0);
  const range = maxNetResult - minNetResult || 1;

  const PieChart = ({ data }: { data: CategoryData[] }) => {
    if (data.length === 0) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '30px 20px',
          gap: '16px',
        }}>
          <div style={{
            textAlign: 'center',
            color: '#6b7280',
            fontSize: '13px',
            lineHeight: '1.6',
          }}>
            La structure des charges apparaîtra<br />
            dès que des dépenses catégorisées seront enregistrées.
          </div>
          <button
            onClick={() => navigate(`/app/company/${companyId}/expenses/new`)}
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              color: '#6b7280',
              backgroundColor: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#2563eb';
              e.currentTarget.style.color = '#2563eb';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#d1d5db';
              e.currentTarget.style.color = '#6b7280';
            }}
          >
            Ajouter une dépense
          </button>
        </div>
      );
    }

    if (data.length < 3) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '30px 20px',
          gap: '16px',
        }}>
          <div style={{
            textAlign: 'center',
            color: '#6b7280',
            fontSize: '13px',
            lineHeight: '1.6',
          }}>
            La structure des charges apparaîtra<br />
            dès que des dépenses catégorisées seront enregistrées.
          </div>
          <button
            onClick={() => navigate(`/app/company/${companyId}/expenses/new`)}
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              color: '#6b7280',
              backgroundColor: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#2563eb';
              e.currentTarget.style.color = '#2563eb';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#d1d5db';
              e.currentTarget.style.color = '#6b7280';
            }}
          >
            Ajouter une dépense
          </button>
        </div>
      );
    }

    const total = data.reduce((sum, item) => sum + item.amount, 0);
    let currentAngle = -90;

    return (
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
        <svg width="120" height="120" viewBox="0 0 120 120">
          {data.map((item, index) => {
            const percentage = (item.amount / total) * 100;
            const angle = (percentage / 100) * 360;
            const startAngle = currentAngle;
            const endAngle = currentAngle + angle;

            currentAngle += angle;

            const startX = 60 + 50 * Math.cos((startAngle * Math.PI) / 180);
            const startY = 60 + 50 * Math.sin((startAngle * Math.PI) / 180);
            const endX = 60 + 50 * Math.cos((endAngle * Math.PI) / 180);
            const endY = 60 + 50 * Math.sin((endAngle * Math.PI) / 180);

            const largeArcFlag = angle > 180 ? 1 : 0;

            const pathData = [
              `M 60 60`,
              `L ${startX} ${startY}`,
              `A 50 50 0 ${largeArcFlag} 1 ${endX} ${endY}`,
              `Z`,
            ].join(' ');

            return (
              <path
                key={index}
                d={pathData}
                fill={item.color}
                stroke="white"
                strokeWidth="2"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  navigate(`/app/company/${companyId}/expenses`);
                }}
              />
            );
          })}
        </svg>

        <div style={{ flex: 1 }}>
          {data.map((item, index) => (
            <div
              key={index}
              onClick={() => {
                navigate('/app/depenses');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '2px',
                    backgroundColor: item.color,
                  }}
                />
                <span style={{ color: '#374151', fontWeight: '500' }}>
                  {item.category}
                </span>
              </div>
              <span style={{ color: '#6b7280', fontWeight: '600' }}>
                {item.percentage.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      padding: '32px',
      backgroundColor: 'white',
      borderRadius: '16px',
      border: '1px solid #e5e7eb',
      marginBottom: '32px',
    }}>
      <h3 style={{
        margin: '0 0 24px 0',
        fontSize: '18px',
        fontWeight: '700',
        color: '#111827',
        letterSpacing: '-0.01em',
      }}>
        Vue synthèse
      </h3>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '24px',
      }}>
        <div style={{
          padding: '24px',
          backgroundColor: getSituationBackground(),
          borderRadius: '12px',
          border: `1px solid ${getSituationBorder()}`,
        }}>
          <div style={{
            fontSize: '11px',
            color: '#475569',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '16px',
          }}>
            Situation actuelle
          </div>

          <div style={{
            fontSize: '13px',
            color: '#475569',
            marginBottom: '12px',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            {currentPeriod}
          </div>

          <div style={{
            fontSize: '32px',
            fontWeight: '800',
            color: netResult === 0 ? '#1e293b' : (netResult > 0 ? '#047857' : '#b91c1c'),
            marginBottom: '16px',
            lineHeight: '1.1',
          }}>
            {getResultLabel()}
          </div>

          <div style={{
            fontSize: '14px',
            color: '#475569',
            lineHeight: '1.7',
          }}>
            {getPedagogicalMessage()}
          </div>
        </div>

        <div style={{
          padding: '24px',
          backgroundColor: '#dbeafe',
          borderRadius: '12px',
          border: '1px solid #93c5fd',
        }}>
          <div style={{
            fontSize: '11px',
            color: '#475569',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '16px',
          }}>
            Tendance
          </div>

          {totalEntriesCount >= 3 && monthsWithData >= 2 ? (
            <svg width="100%" height="160" viewBox="0 0 280 160" preserveAspectRatio="xMidYMid meet">
              <line x1="20" y1="80" x2="270" y2="80" stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3 3" />

              <g>
                {monthlyTrend.map((data, index) => {
                  const x = 40 + (index * 40);
                  const normalizedValue = (data.netResult - minNetResult) / range;
                  const y = 140 - (normalizedValue * 100);

                  return (
                    <g key={index}>
                      {index > 0 && (
                        <line
                          x1={40 + ((index - 1) * 40)}
                          y1={140 - (((monthlyTrend[index - 1].netResult - minNetResult) / range) * 100)}
                          x2={x}
                          y2={y}
                          stroke="#2563eb"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      )}
                      <circle
                        cx={x}
                        cy={y}
                        r="3"
                        fill="#2563eb"
                        stroke="white"
                        strokeWidth="2"
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setHoveredPoint(index)}
                        onMouseLeave={() => setHoveredPoint(null)}
                      />
                      <text
                        x={x}
                        y="155"
                        textAnchor="middle"
                        fontSize="9"
                        fill="#9ca3af"
                        fontWeight="500"
                      >
                        {data.month}
                      </text>

                      {hoveredPoint === index && (
                        <g>
                          <rect
                            x={x - 50}
                            y={y - 55}
                            width="100"
                            height="45"
                            fill="white"
                            stroke="#e5e7eb"
                            strokeWidth="1"
                            rx="4"
                            filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
                          />
                          <text
                            x={x}
                            y={y - 38}
                            textAnchor="middle"
                            fontSize="9"
                            fill="#6b7280"
                            fontWeight="600"
                          >
                            {data.month}
                          </text>
                          <text
                            x={x}
                            y={y - 26}
                            textAnchor="middle"
                            fontSize="10"
                            fill="#111827"
                            fontWeight="700"
                          >
                            {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(data.netResult)}
                          </text>
                          <text
                            x={x}
                            y={y - 14}
                            textAnchor="middle"
                            fontSize="8"
                            fill="#9ca3af"
                          >
                            {data.entriesCount} écriture{data.entriesCount > 1 ? 's' : ''}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '160px',
              textAlign: 'center',
              padding: '0 20px',
            }}>
              <div>
                <div style={{
                  fontSize: '13px',
                  color: '#475569',
                  lineHeight: '1.6',
                }}>
                  Tendance disponible après enregistrement<br />
                  de plusieurs écritures sur au moins 2 mois.
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{
          padding: '24px',
          backgroundColor: '#fed7aa',
          borderRadius: '12px',
          border: '1px solid #fdba74',
        }}>
          <div style={{
            fontSize: '11px',
            color: '#475569',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '6px',
          }}>
            Structure des charges
          </div>

          <div style={{
            fontSize: '9px',
            color: '#9ca3af',
            marginBottom: '16px',
          }}>
            Montants HT · Écritures validées
          </div>

          <PieChart data={expensesByCategory} />
        </div>
      </div>
    </div>
  );
}
