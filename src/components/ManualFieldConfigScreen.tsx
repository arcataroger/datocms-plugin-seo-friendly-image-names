import {
  type Field,
  RenderManualFieldExtensionConfigScreenCtx,
} from "datocms-plugin-sdk";
import { Canvas } from "datocms-react-ui";
import { DebugTree } from "../utils/DebugTree.tsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Mention,
  MentionsInput,
  type OnChangeHandlerFunc,
  type SuggestionDataItem,
} from "react-mentions";
import s from "./styles.module.css";
import "datocms-react-ui/styles.css";
import { cmaClient } from "../utils/cmaClient.ts";
import type { Item } from "@datocms/cma-client/dist/types/generated/SimpleSchemaTypes";

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

interface SuggestionDataItemWithMetadata extends SuggestionDataItem {
  field: Field;
}

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

  const [templateString, setTemplateString] = useState<string>();
  const [exampleRecord, setExampleRecord] = useState<Item>();

  useEffect(() => {
    (async () => {
      try {
        const response = await cmaClient.items.list({
          filter: {
            type: currentModelId,
          },
          page: {
            limit: 1,
          },
          order_by: "_updated_at_DESC",
        });

        if (response) {
          setExampleRecord(response[0]);
        }
      } catch (error) {
        console.error(error);
      }
    })();
  }, []);

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

  const mentionableFields = useMemo<SuggestionDataItemWithMetadata[]>(() => {
    const supportedFieldsInCurrentModel = getSupportedFields(currentModelId);

    return supportedFieldsInCurrentModel.flatMap((field) => {
      switch (field?.attributes?.field_type) {
        /*        case "link": {
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
        }*/

        default:
          return [
            { id: field.id, display: field.attributes.api_key, field: field },
          ];
      }
    });
  }, [currentModelId, allFieldsById]);

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

  const handleTemplateStringChange: OnChangeHandlerFunc = (
    _event,
    newValue,
    _newPlaintext,
    _mentions,
  ) => {
    setTemplateString(newValue);
  };

  const exampleString = useMemo<string | undefined>(() => {
    if (!templateString?.length) {
      return undefined;
    }
    const regex = /\{(.+?)}/g;
    const replacedString = templateString.replace(
      regex,
      (_, match) => (exampleRecord?.[match] as string) ?? "",
    );
    console.log(replacedString);
    return replacedString;
  }, [templateString]);

  return (
    <Canvas ctx={ctx} noAutoResizer={false}>
      <MentionsInput
        value={templateString}
        onChange={handleTemplateStringChange}
        className={s.templateString}
      >
        <Mention
          className={s.templateField}
          trigger="{"
          data={mentionableFields}
          // renderSuggestion={renderTemplateSuggestion}
          markup={"{__display__}"}
          displayTransform={(_, display) => `{${display}}`}
        />
      </MentionsInput>
      <span>Example: {exampleString ?? "No example record found"}</span>
      <pre>{templateString}</pre>
      <DebugTree data={{ exampleRecord }} />
      <DebugTree data={{ mentionableFields }} />
      <DebugTree data={{ currentModelFields }} />
    </Canvas>
  );
};
