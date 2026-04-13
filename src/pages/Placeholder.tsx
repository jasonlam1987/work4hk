import React from 'react';

const Placeholder: React.FC<{ title: string }> = ({ title }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center">
      <div className="w-24 h-24 bg-gray-100 rounded-apple-lg flex items-center justify-center mb-6">
        <span className="text-4xl text-gray-400">🚧</span>
      </div>
      <h1 className="text-2xl font-semibold text-apple-dark">{title}</h1>
      <p className="text-gray-500 mt-2 max-w-md">
        此模塊正在開發中。敬請期待後續更新！
      </p>
    </div>
  );
};

export default Placeholder;
