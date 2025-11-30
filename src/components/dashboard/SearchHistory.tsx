import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Search, Trash2, TrendingUp } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface SearchHistoryItem {
  query: string;
  timestamp: Date;
  results: number;
}

export function SearchHistory() {
  const navigate = useNavigate();
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);

  useEffect(() => {
    // Load search history from localStorage
    const stored = localStorage.getItem('search_history');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setHistory(parsed.map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp)
        })));
      } catch (e) {
        console.error('Failed to parse search history:', e);
      }
    } else {
      // Add some demo data
      const demoData: SearchHistoryItem[] = [
        { query: 'Sol Ring', timestamp: new Date(Date.now() - 1000 * 60 * 5), results: 50 },
        { query: 'Counterspell', timestamp: new Date(Date.now() - 1000 * 60 * 30), results: 120 },
        { query: 'Lightning Bolt', timestamp: new Date(Date.now() - 1000 * 60 * 60), results: 200 },
      ];
      setHistory(demoData);
    }
  }, []);

  const clearHistory = () => {
    localStorage.removeItem('search_history');
    setHistory([]);
  };

  const repeatSearch = (query: string) => {
    navigate(`/cards?q=${encodeURIComponent(query)}`);
  };

  const getTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Searches
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No recent searches</p>
            <p className="text-xs mt-1">Your search history will appear here</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Searches
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={clearHistory}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {history.slice(0, 5).map((item, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer group"
              onClick={() => repeatSearch(item.query)}
            >
              <div className="flex items-center gap-3 flex-1">
                <Search className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{item.query}</p>
                  <p className="text-xs text-muted-foreground">{getTimeAgo(item.timestamp)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {item.results} results
                </Badge>
                <TrendingUp className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
