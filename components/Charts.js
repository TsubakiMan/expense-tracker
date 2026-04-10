'use client';

import { Doughnut, Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement, CategoryScale, LinearScale,
  PointElement, LineElement, BarElement,
  Filler, Tooltip, Legend,
} from 'chart.js';

ChartJS.register(
  ArcElement, CategoryScale, LinearScale,
  PointElement, LineElement, BarElement,
  Filler, Tooltip, Legend
);

const CHART_COLORS = [
  '#818cf8','#fb7185','#34d399','#fbbf24','#38bdf8',
  '#a78bfa','#f472b6','#2dd4bf','#fb923c','#60a5fa',
  '#c084fc','#e879f9','#4ade80','#facc15','#22d3ee',
];

const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(15,23,42,0.95)',
  titleColor: '#f1f5f9',
  bodyColor: '#94a3b8',
  borderColor: 'rgba(100,116,139,0.3)',
  borderWidth: 1,
  padding: 12,
  cornerRadius: 8,
};

export function ExpenseDonut({ data, labels }) {
  if (!data || data.length === 0) return null;
  return (
    <Doughnut
      data={{
        labels,
        datasets: [{
          data,
          backgroundColor: CHART_COLORS.slice(0, data.length),
          borderWidth: 0,
          hoverOffset: 6,
        }],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TOOLTIP_STYLE,
            callbacks: {
              label: (ctx) => ` ¥${ctx.raw.toLocaleString()}`,
            },
          },
        },
      }}
    />
  );
}

export function ProjectionChart({ months, adjusted, current }) {
  const datasets = [
    {
      label: '調整後',
      data: adjusted,
      borderColor: '#818cf8',
      backgroundColor: 'rgba(129,140,248,0.08)',
      fill: true,
      tension: 0.4,
      pointRadius: 4,
      pointBackgroundColor: '#818cf8',
      pointBorderWidth: 0,
      borderWidth: 2.5,
    },
  ];
  if (current) {
    datasets.push({
      label: '現在ペース',
      data: current,
      borderColor: 'rgba(148,163,184,0.35)',
      borderDash: [6, 4],
      fill: false,
      tension: 0.4,
      pointRadius: 0,
      borderWidth: 1.5,
    });
  }
  return (
    <Line
      data={{ labels: months, datasets }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        scales: {
          x: {
            grid: { color: 'rgba(100,116,139,0.08)' },
            ticks: { color: '#475569', font: { size: 11 } },
          },
          y: {
            grid: { color: 'rgba(100,116,139,0.08)' },
            ticks: {
              color: '#475569', font: { size: 11 },
              callback: v => `${(v / 10000).toFixed(0)}万`,
            },
          },
        },
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 } },
          tooltip: {
            ...TOOLTIP_STYLE,
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ¥${Math.round(ctx.raw).toLocaleString()}`,
            },
          },
        },
      }}
    />
  );
}

export function SurplusBar({ labels, data }) {
  return (
    <Bar
      data={{
        labels,
        datasets: [{
          data,
          backgroundColor: data.map(v =>
            v >= 0 ? 'rgba(52,211,153,0.7)' : 'rgba(251,113,133,0.7)'
          ),
          borderRadius: 6,
          maxBarThickness: 32,
        }],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#475569', font: { size: 11 } },
          },
          y: {
            grid: { color: 'rgba(100,116,139,0.08)' },
            ticks: {
              color: '#475569', font: { size: 11 },
              callback: v => `${(v / 10000).toFixed(0)}万`,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TOOLTIP_STYLE,
            callbacks: {
              label: (ctx) => `¥${Math.round(ctx.raw).toLocaleString()}`,
            },
          },
        },
      }}
    />
  );
}

export { CHART_COLORS };
