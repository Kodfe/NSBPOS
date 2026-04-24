interface Props {
  title: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color?: 'saffron' | 'green' | 'blue' | 'purple' | 'red';
  trend?: { value: number; label: string };
}

const COLORS = {
  saffron: 'bg-saffron-50 text-saffron-600 border-saffron-100',
  green: 'bg-green-50 text-green-600 border-green-100',
  blue: 'bg-blue-50 text-blue-600 border-blue-100',
  purple: 'bg-purple-50 text-purple-600 border-purple-100',
  red: 'bg-red-50 text-red-600 border-red-100',
};

export default function StatsCard({ title, value, sub, icon, color = 'saffron', trend }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-start gap-4 shadow-sm">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border ${COLORS[color]}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        {trend !== undefined && (
          <p className={`text-xs font-medium mt-1 ${trend.value >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {trend.value >= 0 ? '▲' : '▼'} {Math.abs(trend.value).toFixed(1)}% {trend.label}
          </p>
        )}
      </div>
    </div>
  );
}
