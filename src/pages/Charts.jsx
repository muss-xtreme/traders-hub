// Charts: live candlestick / tick chart for any market, streamed from Deriv's public socket.
// (Deriv's hosted chart app still points at the retired legacy socket, so it renders empty.)

import { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { deriv } from '../lib/deriv.js';
import { MARKETS, marketBySymbol } from '../lib/markets.js';
import { MarketSelect } from '../components/ui.jsx';

const FRAMES = [
  { id: 'ticks', label: 'Ticks', granularity: 0 },
  { id: '1m', label: '1m', granularity: 60 },
  { id: '5m', label: '5m', granularity: 300 },
  { id: '15m', label: '15m', granularity: 900 },
  { id: '1h', label: '1h', granularity: 3600 },
  { id: '4h', label: '4h', granularity: 14400 },
  { id: '1d', label: '1d', granularity: 86400 },
];

const SYMBOL_KEY = 'th.charts.symbol';
const FRAME_KEY = 'th.charts.frame';

const toCandle = (c) => ({ time: Number(c.open_time ?? c.epoch), open: +c.open, high: +c.high, low: +c.low, close: +c.close });

export default function Charts() {
  const host = useRef(null);
  const chartRef = useRef(null);
  const [symbol, setSymbol] = useState(() => localStorage.getItem(SYMBOL_KEY) || 'R_100');
  const [frame, setFrame] = useState(() => localStorage.getItem(FRAME_KEY) || '1m');
  const [last, setLast] = useState(null);
  const [error, setError] = useState(null);

  // Create the chart once; autoSize keeps it fitted to its container.
  useEffect(() => {
    const chart = createChart(host.current, {
      autoSize: true,
      layout: { background: { color: '#ffffff' }, textColor: '#4b3b3e', fontFamily: 'Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: '#f6ecec' }, horzLines: { color: '#f6ecec' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#f1dada' },
      timeScale: { borderColor: '#f1dada', timeVisible: true, secondsVisible: true },
    });
    chartRef.current = chart;
    return () => { chart.remove(); chartRef.current = null; };
  }, []);

  // (Re)load data whenever market or timeframe changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return undefined;
    const { granularity } = FRAMES.find((f) => f.id === frame);
    const decimals = marketBySymbol(symbol).decimals;
    const priceFormat = { type: 'price', precision: decimals, minMove: 1 / 10 ** decimals };
    const series = granularity
      ? chart.addCandlestickSeries({ upColor: '#16a34a', downColor: '#dc2626', borderVisible: false, wickUpColor: '#16a34a', wickDownColor: '#dc2626', priceFormat })
      : chart.addAreaSeries({ lineColor: '#dc2626', topColor: 'rgba(220,38,38,.25)', bottomColor: 'rgba(220,38,38,0)', lineWidth: 2, priceFormat });
    chart.applyOptions({ timeScale: { secondsVisible: !granularity || granularity < 300 } });
    setError(null);
    setLast(null);

    const payload = granularity
      ? { ticks_history: symbol, end: 'latest', count: 500, style: 'candles', granularity }
      : { ticks_history: symbol, end: 'latest', count: 500, style: 'ticks' };

    let seeded = false;
    const stop = deriv.subscribe(payload, (m) => {
      if (m.candles) {
        series.setData(m.candles.map(toCandle));
        seeded = true;
        chart.timeScale().fitContent();
        setLast(+m.candles.at(-1)?.close);
      } else if (m.history) {
        series.setData(m.history.prices.map((p, i) => ({ time: m.history.times[i], value: +p })));
        seeded = true;
        chart.timeScale().fitContent();
        setLast(+m.history.prices.at(-1));
      } else if (seeded && m.ohlc) {
        series.update(toCandle(m.ohlc));
        setLast(+m.ohlc.close);
      } else if (seeded && m.tick) {
        series.update({ time: m.tick.epoch, value: +m.tick.quote });
        setLast(+m.tick.quote);
      }
    }, (e) => setError(e.message ?? 'Chart data unavailable'));

    return () => {
      stop();
      // The chart may already be disposed if the whole component is unmounting.
      if (chartRef.current === chart) chart.removeSeries(series);
    };
  }, [symbol, frame]);

  const pickSymbol = (s) => { localStorage.setItem(SYMBOL_KEY, s); setSymbol(s); };
  const pickFrame = (f) => { localStorage.setItem(FRAME_KEY, f); setFrame(f); };
  const decimals = marketBySymbol(symbol).decimals;

  return (
    <div className="charts">
      <div className="charts__bar">
        <div className="charts__market"><MarketSelect value={symbol} onChange={pickSymbol} markets={MARKETS} /></div>
        <div className="toggle">
          {FRAMES.map((f) => (
            <button key={f.id} type="button" className={frame === f.id ? 'is-active' : ''} onClick={() => pickFrame(f.id)}>{f.label}</button>
          ))}
        </div>
        <b className="charts__price">{last != null ? last.toFixed(decimals) : '—'}</b>
      </div>
      {error && <p className="notice notice--error">{error}</p>}
      <div ref={host} className="charts__canvas" />
    </div>
  );
}
