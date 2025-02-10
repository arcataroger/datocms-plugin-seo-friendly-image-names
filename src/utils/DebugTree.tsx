import React, { useEffect, useMemo, useState } from "react";
import { JSONTree } from "react-json-tree";
import { TextField } from "datocms-react-ui";
import type {
  LabelRenderer,
  ShouldExpandNodeInitially,
  ValueRenderer,
} from "react-json-tree";
import type { Theme } from "react-base16-styling";

// Solarized Light theme (from https://github.com/mk12/base16-solarized-scheme)
const theme: Theme = {
  scheme: "Solarized Light",
  author: "Ethan Schoonover, Mitchell Kember",
  base00: "#fdf6e3",
  base01: "#eee8d5",
  base02: "#c0c4bb",
  base03: "#93a1a1",
  base04: "#839496",
  base05: "#657b83",
  base06: "#586e75",
  base07: "#002b36",
  base08: "#dc322f",
  base09: "#cb4b16",
  base0A: "#b58900",
  base0B: "#859900",
  base0C: "#2aa198",
  base0D: "#268bd2",
  base0E: "#6c71c4",
  base0F: "#d33682",
};

/**
 * A simple debouncing hook.
 */
const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
};

/**
 * DebugTree displays the given JSON-like data.
 * It supports filtering by key or value.
 */
export const DebugTree = ({ data }: { data: unknown }) => {
  const [filterText, setFilterText] = useState("");
  const debouncedFilterText = useDebounce(filterText, 100);

  const dataWithoutFunctions = useMemo<unknown>(() => {
    // If it's an array, filter out any items that are functions.
    if (Array.isArray(data)) {
      return data.filter((item) => typeof item !== "function").sort();
    }

    // If it's a non-null object, remove properties whose values are functions.
    if (data !== null && typeof data === "object") {
      return Object.fromEntries(
        Object.entries(data)
          .filter(([, value]) => typeof value !== "function")
          .sort(),
      );
    }

    // If it's not an object or array, return it as-is.
    return data;
  }, [data]);

  const searchTerm = debouncedFilterText.trim().toLowerCase();

  const filterRegex = searchTerm
    ? new RegExp(
        `(${searchTerm.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")})`,
        "gi",
      )
    : null;

  /**
   * Compute the filtered tree and record matching paths.
   * Since this DFS can be expensive on large trees, we memoize it.
   */
  const { filteredData, matchingPaths } = useMemo(() => {
    if (!searchTerm)
      return { filteredData: dataWithoutFunctions, matchingPaths: [] };

    const matchPaths: (string | number)[][] = [];
    const stack: Array<{ node: any; path: (string | number)[] }> = [
      { node: dataWithoutFunctions, path: [] },
    ];

    while (stack.length) {
      const { node, path } = stack.pop()!;
      if (node !== null && typeof node === "object") {
        if (Array.isArray(node)) {
          node.forEach((child, i) => {
            const childPath = [...path, i];
            if (child === null || typeof child !== "object") {
              if (String(child).toLowerCase().includes(searchTerm)) {
                matchPaths.push(childPath);
              }
            } else {
              stack.push({ node: child, path: childPath });
            }
          });
        } else {
          Object.entries(node).forEach(([key, child]) => {
            const childPath = [...path, key];
            if (key.toLowerCase().includes(searchTerm)) {
              // If a key matches, record the branch and do not traverse further.
              matchPaths.push(childPath);
              return;
            }
            if (child === null || typeof child !== "object") {
              if (String(child).toLowerCase().includes(searchTerm)) {
                matchPaths.push(childPath);
              }
            } else {
              stack.push({ node: child, path: childPath });
            }
          });
        }
      } else {
        if (String(node).toLowerCase().includes(searchTerm)) {
          matchPaths.push(path);
        }
      }
    }

    /**
     * Reconstruct the filtered tree from matching paths.
     * We build it first as a plain object then convert any array-like objects back.
     */
    const buildFilteredTree = (
      original: any,
      paths: (string | number)[][],
    ): any => {
      const filteredObj: Record<string, any> = {};

      for (const path of paths) {
        let pointerFiltered = filteredObj;
        let pointerOriginal = original;
        for (let i = 0; i < path.length; i++) {
          const keyStr = String(path[i]);
          if (i < path.length - 1) {
            if (!(keyStr in pointerFiltered)) {
              pointerFiltered[keyStr] = {};
            }
            pointerFiltered = pointerFiltered[keyStr];
            pointerOriginal = pointerOriginal[path[i]];
          } else {
            pointerFiltered[keyStr] = pointerOriginal[path[i]];
          }
        }
      }

      // Convert objects that represent arrays back into arrays.
      const convertArrays = (obj: any, originalRef: any): any => {
        if (Array.isArray(originalRef)) {
          const arr: any[] = [];
          Object.keys(obj)
            .map(Number)
            .sort((a, b) => a - b)
            .forEach((key) => {
              arr[key] = convertArrays(obj[String(key)], originalRef[key]);
            });
          console.log(arr);
          return [...arr];
        } else if (obj && typeof obj === "object") {
          return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [
              key,
              convertArrays(value, originalRef && originalRef[key]),
            ]),
          );
        }
        return obj;
      };

      return convertArrays(filteredObj, original);
    };

    const filteredTree = buildFilteredTree(dataWithoutFunctions, matchPaths);
    return { filteredData: filteredTree, matchingPaths: matchPaths };
  }, [dataWithoutFunctions, searchTerm]);

  /**
   * Expand any node whose forward key path is an ancestor of a matching path.
   * Note: keyPath (provided by JSONTree) is in reverse order.
   */
  const shouldExpandNodeInitially: ShouldExpandNodeInitially = (keyPath) => {
    const fullPath = [...keyPath].reverse();
    return matchingPaths.some(
      (match) =>
        match.length > fullPath.length &&
        fullPath.every((val, i) => String(val) === String(match[i])),
    );
  };

  /**
   * Label renderer that highlights matching portions of keys.
   */
  const customLabelRenderer: LabelRenderer = (keyPath) => {
    const fullPath = [...keyPath].reverse();
    const currentKey = fullPath[fullPath.length - 1];
    const keyStr = String(currentKey);

    if (filterRegex) {
      const parts = keyStr.split(filterRegex);
      return (
        <span>
          {parts.map((part, i) =>
            filterRegex.test(part) ? (
              <span key={i} style={{ backgroundColor: "yellow" }}>
                {part}
              </span>
            ) : (
              part
            ),
          )}
        </span>
      );
    }
    return <span>{keyStr}</span>;
  };

  /**
   * Value renderer that highlights matching portions of values.
   */
  const customValueRenderer: ValueRenderer = (valueAsString, value) => {
    const valStr = String(valueAsString); // I think this was just mistyped...?

    if (filterRegex) {
      const parts = valStr.split(filterRegex);
      return (
        <>
          {parts.map((part, i) =>
            filterRegex.test(part) ? (
              <span key={i} style={{ backgroundColor: "yellow" }}>
                {part}
              </span>
            ) : (
              part
            ),
          )}
        </>
      );
    }

    return valStr ?? (value as React.ReactNode);
  };

  // Build a key to force JSONTree to reset expand/collapse state.
  // This is computed inline because JSON.stringify here is fast enough.
  const treeKey = JSON.stringify({
    filter: debouncedFilterText,
    data: filteredData,
  });

  return (
    <>
      <h3>Debug</h3>
      <TextField
        id="debugFilter"
        name="debugFilter"
        label="Filter by key or value"
        value={filterText}
        onChange={(value) => setFilterText(value)}
      />
      <div style={{ overflowY: "auto", height: 300, marginTop: 5 }}>
        {filteredData && Object.values(filteredData).length > 0 ? (
          <JSONTree
            key={treeKey}
            data={filteredData}
            theme={theme}
            valueRenderer={customValueRenderer}
            hideRoot={true}
            shouldExpandNodeInitially={shouldExpandNodeInitially}
            labelRenderer={customLabelRenderer}
          />
        ) : (
          `No results for "${debouncedFilterText}".`
        )}
      </div>
    </>
  );
};
