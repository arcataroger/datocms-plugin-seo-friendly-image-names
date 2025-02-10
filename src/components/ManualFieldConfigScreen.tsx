import {
  type Field,
  RenderManualFieldExtensionConfigScreenCtx,
} from "datocms-plugin-sdk";
import { Canvas } from "datocms-react-ui";
import { DebugTree } from "../utils/DebugTree.tsx";
import { useCallback, useMemo } from "react";

const SUPPORTED_FIELD_TYPES: readonly Field["attributes"]["field_type"][] = [
  "string",
  "slug",
  "integer",
  "float",
  "link",
];

type Validators =
  | {
      item_item_type?: {
        item_types: string[];
      };
    }
  | undefined;

export const ManualFieldConfigScreen = ({
  ctx,
}: {
  ctx: RenderManualFieldExtensionConfigScreenCtx;
}) => {
  const {
    itemType: { id: currentModelId },
    fields: allFieldsById,
    itemTypes: allItemTypesById,
  } = ctx;

  const getSupportedFields = useCallback(
    (
      modelId: string,
    ): Extract<
      Field,
      { attributes: { field_type: (typeof SUPPORTED_FIELD_TYPES)[number] } }
    >[] =>
      Object.values(allFieldsById)
        .flatMap((field) =>
          field?.relationships?.item_type?.data?.id === modelId &&
          SUPPORTED_FIELD_TYPES.includes(field?.attributes?.field_type)
            ? [field]
            : [],
        )
        .sort((a, b) =>
          a.attributes.api_key.localeCompare(b.attributes.api_key),
        ),
    [allFieldsById, SUPPORTED_FIELD_TYPES],
  );

  const currentModelFields: { [k: string]: Field } = useMemo(() => {
    const supportedFieldsInCurrentModel = getSupportedFields(currentModelId);

    return Object.fromEntries(
      supportedFieldsInCurrentModel.flatMap((field) => {
        switch (field?.attributes?.field_type) {
          case "link": {
            const validators = field?.attributes.validators as Validators;
            const relatedModelIds = validators?.item_item_type?.item_types;
            if (!relatedModelIds) {
              return [];
            }

            const relatedModels = relatedModelIds.map(
              (id) => allItemTypesById[id]!,
            );

            const relatedModelsByApiKey = Object.fromEntries(
              relatedModels.map((model) => [
                model.attributes.api_key,
                {
                  model,
                  fields: Object.fromEntries(
                    getSupportedFields(model.id).map((field) => [
                      field.attributes.api_key,
                      field,
                    ]),
                  ),
                },
              ]),
            );

            return [
              [
                field.attributes.api_key,
                { ...field, relatedModels: relatedModelsByApiKey },
              ],
            ];
          }

          default:
            return [[field.attributes.api_key, field]];
        }
      }),
    );
  }, [currentModelId, allFieldsById]);

  return (
    <Canvas ctx={ctx} noAutoResizer={false}>
      <DebugTree data={{ currentModelFields }} />
    </Canvas>
  );
};
