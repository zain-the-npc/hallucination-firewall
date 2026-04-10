const mockLogs = [
  { id: "1", user_question: "Who was the first person on Mars?", gpt_raw_answer: "Neil Armstrong was the first person...", hallucination_score: 0.85, status: "CORRECTED" },
  { id: "2", user_question: "What is 2+2?", gpt_raw_answer: "4", hallucination_score: 0.05, status: "PASSED" },
  { id: "3", user_question: "When did Einstein invent the lightbulb?", gpt_raw_answer: "Einstein invented the lightbulb in 1879.", hallucination_score: 0.92, status: "FLAGGED" },
];

export default function LogsTable() {
  return (
    <div className="w-full mt-8 overflow-x-auto">
      <table className="w-full text-sm text-left text-gray-300">
        <thead className="text-xs uppercase bg-gray-800 text-gray-400">
          <tr>
            <th className="px-6 py-3">Question</th>
            <th className="px-6 py-3">Raw Answer</th>
            <th className="px-6 py-3">Score</th>
            <th className="px-6 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {mockLogs.map((log) => (
            <tr key={log.id} className="bg-gray-900 border-b border-gray-800">
              <td className="px-6 py-4 font-medium text-white truncate max-w-xs">{log.user_question}</td>
              <td className="px-6 py-4 truncate max-w-xs">{log.gpt_raw_answer}</td>
              <td className="px-6 py-4 font-mono">{log.hallucination_score}</td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded text-xs ${
                  log.status === "PASSED" ? "bg-green-900 text-green-300" :
                  log.status === "FLAGGED" ? "bg-red-900 text-red-300" :
                  "bg-blue-900 text-blue-300"
                }`}>
                  {log.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
