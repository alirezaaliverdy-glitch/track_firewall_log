import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useLogContext } from "@/context/LogContext";

export default function LogChart() {
  const { filteredData } = useLogContext();
  // Limit chart to first 50 records for performance
  const chartData = React.useMemo(
    () => filteredData.slice(0, 50),
    [filteredData]
  );
  return (
    <div style={{ width: "100%", height: 400 }}>
      <ResponsiveContainer>
        <LineChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="Time" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="Bytes" stroke="#8884d8" name="Bytes" />
          <Line
            type="monotone"
            dataKey="Bytes Sent"
            stroke="#82ca9d"
            name="Bytes Sent"
          />
          <Line
            type="monotone"
            dataKey="Bytes Received"
            stroke="#ff7300"
            name="Bytes Received"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
