import { RenderManualFieldExtensionConfigScreenCtx } from "datocms-plugin-sdk";
import { Canvas } from "datocms-react-ui";
import { DebugTree } from "../utils/DebugTree.tsx";

export const ManualFieldConfigScreen = ({
  ctx,
}: {
  ctx: RenderManualFieldExtensionConfigScreenCtx;
}) => {
  ctx.setHeight(500);

  return (
    <Canvas ctx={ctx} noAutoResizer={true}>
      <DebugTree data={ctx} />
    </Canvas>
  );
};
