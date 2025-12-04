import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText, Download, Printer } from "lucide-react";
import { toast } from "sonner";

interface InsuranceReportProps {
  collectionValue: number;
  cardCount: number;
  topCards?: Array<{ name: string; value: number }>;
}

export function InsuranceReport({ collectionValue = 0, cardCount = 0, topCards = [] }: InsuranceReportProps) {
  const [open, setOpen] = useState(false);
  
  // Filter and sanitize topCards to ensure valid values
  const safeTopCards = topCards.filter(card => card && card.name).map(card => ({
    name: card.name,
    value: typeof card.value === 'number' ? card.value : parseFloat(String(card.value || 0)) || 0
  }));

  const generateReport = () => {
    const reportDate = new Date().toLocaleDateString();
    let report = `MAGIC: THE GATHERING COLLECTION INSURANCE REPORT\n`;
    report += `Generated: ${reportDate}\n\n`;
    report += `═══════════════════════════════════════\n\n`;
    report += `COLLECTION SUMMARY\n`;
    report += `Total Cards: ${cardCount}\n`;
    report += `Total Value: $${(collectionValue || 0).toFixed(2)}\n`;
    report += `Average Card Value: $${cardCount > 0 ? ((collectionValue || 0) / cardCount).toFixed(2) : '0.00'}\n\n`;
    
    if (safeTopCards.length > 0) {
      report += `TOP 10 MOST VALUABLE CARDS\n`;
      report += `═══════════════════════════════════════\n`;
      safeTopCards.slice(0, 10).forEach((card, i) => {
        report += `${i + 1}. ${card.name} - $${card.value.toFixed(2)}\n`;
      });
    }
    
    report += `\n\nThis report is for insurance purposes only.\n`;
    report += `Values based on current market prices at time of generation.\n`;

    const blob = new Blob([report], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `insurance_report_${reportDate.replace(/\//g, "-")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success("Insurance report downloaded");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileText className="mr-2 h-4 w-4" />
          Insurance Report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Collection Insurance Report</DialogTitle>
          <DialogDescription>
            Generate a detailed report for insurance documentation
          </DialogDescription>
        </DialogHeader>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Report Summary</CardTitle>
            <CardDescription>Overview of your collection value</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Cards</p>
                <p className="text-2xl font-bold">{cardCount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Value</p>
                <p className="text-2xl font-bold text-green-600">
                  ${collectionValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {safeTopCards.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Top Valuable Cards</p>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {safeTopCards.slice(0, 10).map((card, i) => (
                    <div key={i} className="flex justify-between text-sm p-2 rounded hover:bg-accent">
                      <span>{i + 1}. {card.name}</span>
                      <span className="font-medium">${card.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button onClick={generateReport}>
            <Download className="mr-2 h-4 w-4" />
            Download Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
