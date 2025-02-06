import { JSONTree, ValueRenderer } from "react-json-tree";
import solarizedTheme from "react-json-tree/lib/themes/solarized";
import { type ReactNode } from "react";

export const DebugTree = ({ data }: { data: object }) => {
  const valueRenderer: ValueRenderer = (_, value) => {
    if (typeof value === "function") {
      return "(function)";
    }
    return value as ReactNode;
  };

  return (
    <div style={{ overflowY: "auto", height: 300 }}>
      <h3>Debug</h3>
      <JSONTree
        data={data}
        theme={solarizedTheme}
        invertTheme={true}
        valueRenderer={valueRenderer}
      />
    </div>
  );
};
