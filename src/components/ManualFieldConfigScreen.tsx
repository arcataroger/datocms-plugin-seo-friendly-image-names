import { RenderManualFieldExtensionConfigScreenCtx } from "datocms-plugin-sdk";
import { Canvas } from "datocms-react-ui";
import { DebugTree } from "../utils/DebugTree.tsx";
import { useEffect, useMemo, useState } from "react";
import { cmaClient } from "../utils/cmaClient.ts";
import {
  type Field,
  type FieldInstancesTargetSchema,
  type Item,
} from "@datocms/cma-client/dist/types/generated/SimpleSchemaTypes";

type Validators =
  | {
      item_item_type?: {
        item_types?: string[];
      };
    }
  | undefined;

export const ManualFieldConfigScreen = ({
  ctx,
}: {
  ctx: RenderManualFieldExtensionConfigScreenCtx;
}) => {
  const {
    itemType: {
      attributes: { api_key: modelApiKey },
    },
  } = ctx;

  const [modelFields, setModelFields] = useState<FieldInstancesTargetSchema>(
    [],
  );

  const supportedFieldTypes: Field["field_type"][] = [
    "string",
    "slug",
    "integer",
    "float",
    "link",
  ];

  const supportedFields = useMemo<FieldInstancesTargetSchema>(() => {
    return modelFields.filter((field) =>
      supportedFieldTypes.includes(field.field_type),
    );
  }, [modelFields]);

  const [relatedFields, setRelatedFields] = useState<any>();

  const [mostRecentRecordOfModel, setMostRecentRecordOfModel] =
    useState<Item>();

  useEffect(() => {
    (async () => {
      try {
        const fields = await cmaClient.fields.list(modelApiKey);
        if (fields) {
          setModelFields(fields);

          const linkFields = fields.filter(
            ({ field_type }) => field_type === "link",
          );

          const linkedFields = await Promise.all(
            linkFields.map(async (field) => {
              const { validators } = field as { validators: Validators }; // assuming validators is defined on field

              // If validators exist and there are related model IDs, fetch the fields
              const supportedFields = validators?.item_item_type?.item_types
                ?.length
                ? Object.fromEntries(
                    await Promise.all(
                      validators.item_item_type.item_types.map(
                        async (relatedModelId) => {
                          // Await the asynchronous call for each relatedModelId
                          const modelData =
                            await cmaClient.itemTypes.find(relatedModelId);
                          const { id, api_key, name } = modelData;

                          const fieldData =
                            await cmaClient.fields.list(relatedModelId);

                          const supportedFields = fieldData.filter((field) =>
                            supportedFieldTypes.includes(field.field_type),
                          );

                          return [
                            api_key,
                            {
                              id,
                              api_key,
                              name,
                              supportedFields,
                            },
                          ];
                        },
                      ),
                    ),
                  )
                : [];

              return {
                id: field.id,
                api_key: field.api_key,
                label: field.label,
                type: field.field_type,
                supportedFields,
              };
            }),
          );

          if (linkedFields) {
            console.log("related fields", linkedFields);
            setRelatedFields(
              Object.fromEntries(
                linkedFields.map((model) => [model.api_key, model]),
              ),
            );
          }
        }

        const mostRecentRecord = await cmaClient.items.list({
          filter: {
            type: modelApiKey,
          },
          page: {
            limit: 1,
          },
          order_by: "_updated_at_DESC",
        });

        if (mostRecentRecord?.[0]) {
          setMostRecentRecordOfModel(mostRecentRecord[0]);
        }
      } catch (error) {
        console.error(error);
      }
    })();
  }, [modelApiKey]);

  return (
    <Canvas ctx={ctx} noAutoResizer={false}>
      <ul>
        {supportedFields.map(({ api_key, label, field_type }) => {
          switch (field_type) {
            case "link":

            case "string":
            default:
              return (
                <li key={api_key}>
                  <code>{api_key}</code> ({label}) - e.g.,{" "}
                  <em> {JSON.stringify(mostRecentRecordOfModel?.[api_key])}</em>
                </li>
              );
          }
        })}
      </ul>
      <DebugTree data={supportedFields} />
      <DebugTree data={relatedFields} />
    </Canvas>
  );
};
