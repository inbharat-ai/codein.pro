import React, { useEffect, useRef } from "react";

function useUpdatingRef<T>(value: T, deps: React.DependencyList = []) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value, ...deps]);

  return ref;
}

export default useUpdatingRef;
