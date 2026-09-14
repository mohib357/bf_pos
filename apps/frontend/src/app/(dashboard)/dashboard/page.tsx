'use client';
export default function DashboardPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">
        ড্যাশবোর্ড / Dashboard
      </h1>
      <p className="text-gray-500">
        Welcome to Barakah Finance POS — Business Management System
      </p>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
        {[
          { label: "আজকের বিক্রয়", labelEn: "Today's Sales", value: "৳ 0", color: "bg-green-500" },
          { label: "মোট পণ্য", labelEn: "Total Products", value: "0", color: "bg-blue-500" },
          { label: "কম স্টক", labelEn: "Low Stock", value: "0", color: "bg-yellow-500" },
          { label: "বকেয়া", labelEn: "Due Amount", value: "৳ 0", color: "bg-red-500" },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl shadow p-5 border-l-4" style={{borderLeftColor: card.color.replace('bg-', '')}}>
            <div className={`inline-block px-2 py-1 rounded text-white text-xs font-medium ${card.color} mb-2`}>
              {card.labelEn}
            </div>
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
