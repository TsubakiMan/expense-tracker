'use client';

import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { formatShortMonth } from '../lib/utils';

Chart.register(...registerables);

export default function BalanceChart({ rows, type }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !rows?.length) return;

    if (chartRef.current) chartRef.current.destroy();

    const labels = rows.map(r => formatShortMonth(r.date));
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const tickColor = isDark ? '#888' : '#999';

    let config;

    if (type === 'balance') {
      config = {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: '北洋銀行',
              data: rows.map(r => r.balanceHokyo),
              borderColor: '#2563eb',
              backgroundColor: 'rgba(37,99,235,0.06)',
              fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2,
            },
            {
              label: '楽天銀行',
              data: rows.map(r => r.balanceRakuten),
              borderColor: '#d97706',
              backgroundColor: 'rgba(217,119,6,0.06)',
              fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2,
            },
          ],
        },
        options: chartOptions(gridColor, tickColor, isDark, true),
      };
    } else {
      const surplusData = rows.map(r => {
        const inc = (r.income || 0) + (r.bonus || 0);
        const exp = (r.totalExpense || 0) + (r.extraSpend || 0);
        return inc - exp;
      });
      config = {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: '月次収支',
            data: surplusData,
            backgroundColor: surplusData.map(v => v >= 0
              ? (isDark ? 'rgba(74,222,128,0.7)' : 'rgba(22,163,74,0.7)')
              : (isDark ? 'rgba(248,113,113,0.7)' : 'rgba(220,38,38,0.7)')
            ),
            borderRadius: 4,
          }],
        },
        options: chartOptions(gridColor, tickColor, isDark, false),
      };
    }

    chartRef.current = new Chart(canvasRef.current, config);

    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [rows, type]);

  return <canvas ref={canvasRef} />;
}

function chartOptions(gridColor, tickColor, isDark, showLegend) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: showLegend,
        position: 'bottom',
        labels: {
          boxWidth: 10, padding: 12,
          font: { size: 11 },
          color: tickColor,
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ¥${Math.round(ctx.parsed.y).toLocaleString()}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { font: { size: 10 }, color: tickColor, maxRotation: 0 },
        grid: { display: false },
      },
      y: {
        ticks: {
          font: { size: 10 }, color: tickColor,
          callback: (v) => {
            if (v < 0) return '-¥' + Math.abs(v / 10000).toFixed(0) + '万';
            return '¥' + (v / 10000).toFixed(0) + '万';
          },
        },
        grid: { color: gridColor },
      },
    },
  };
}
