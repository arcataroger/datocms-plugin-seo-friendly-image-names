import {
  type Field,
  type ItemType,
  RenderManualFieldExtensionConfigScreenCtx,
} from "datocms-plugin-sdk";
import { Canvas, Section, Spinner } from "datocms-react-ui";
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
import slugify from "@sindresorhus/slugify";
import { DebugTree } from "../utils/DebugTree.tsx";
import { extractLocalizedString } from "../utils/extractLocalizedString.ts";

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

export type PluginParams = {
  templateString?: string;
};

type RelatedModel = {
  model: ItemType;
  fields: Record<string, Field>;
};

type CurrentModelInfo = Record<
  string,
  Field & { relatedModels?: Record<string, RelatedModel> }
>;

export const templateParsingRegex = /\{(.+?)}/g;

export const ManualFieldConfigScreen = ({
  ctx,
}: {
  ctx: RenderManualFieldExtensionConfigScreenCtx;
}) => {
  const {
    itemType: { id: currentModelId },
    fields: allFieldsById,
    itemTypes: allItemTypesById,
    ui: { locale },
    setParameters,
  } = ctx;

  const { parameters } = ctx as { parameters: PluginParams };

  const [templateString, setTemplateString] = useState<string>(
    parameters.templateString ?? "",
  );
  const [exampleRecord, setExampleRecord] = useState<Item>();
  const [isDebugOpen, setIsDebugOpen] = useState<boolean>(false);
  const [relatedRecords, setRelatedRecords] = useState<Item[]>([]);

  const isLoading = useMemo<boolean>(() => {
    if (!exampleRecord) {
      return true;
    }
    return false;
  }, [exampleRecord]);

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

        if (response?.[0]) {
          const record = response[0];
          const relatedRecords = await cmaClient.items.references(record.id);
          setRelatedRecords(relatedRecords);
          setExampleRecord(record);
        } else {
          setExampleRecord(undefined);
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

  const currentModelFields = useMemo<CurrentModelInfo>(() => {
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

  const mentionableFields = useMemo<SuggestionDataItemWithMetadata[]>(() => {
    return Object.entries(currentModelFields).flatMap(
      ([rootFieldName, field]) => {
        switch (field?.attributes?.field_type) {
          case "link":
            if (field.relatedModels) {
              const allRelatedModelFields = Object.entries(
                field.relatedModels,
              ).flatMap(([modelName, model]) =>
                Object.values(model.fields).map((field) => ({
                  id: `${model.model.id}.${field.id}`, // Here we want the related item type ID, not just the field ID
                  display: `${rootFieldName}.${modelName}.${field.attributes.api_key}`,
                  field: field,
                })),
              );

              return [...allRelatedModelFields];
            } else {
              return [];
            }

          default:
            return [
              { id: field.id, display: field.attributes.api_key, field: field },
            ];
        }
      },
    );
  }, [currentModelFields]);

  useEffect(() => {
    if (templateString) {
      setParameters({
        templateString,
      } as PluginParams);
    }
  }, [templateString]);

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

    if (!exampleRecord) {
      return undefined;
    }
    const replacedString: string = templateString.replace(
      templateParsingRegex,
      (_, fieldName) => {
        const relatedItem = mentionableFields.find(
          (field) => field.display === fieldName,
        );

        const relatedItemTypeId: string = relatedItem?.id?.toString() ?? "";

        // Process related fields like field.other_model.other_field
        const splitFieldName: string[] = fieldName.split(".");
        if (splitFieldName.length >= 2) {
          const fieldInThisModel = splitFieldName[0];
          const fieldInRelatedModel = splitFieldName[splitFieldName.length - 1];
          const idOfRelatedRecord = exampleRecord?.[fieldInThisModel];

          const relatedRecord = relatedRecords.find(
            (record) =>
              record.id === idOfRelatedRecord &&
              (!relatedItemTypeId ||
                relatedItemTypeId.startsWith(record.item_type.id)),
          );

          const relatedData = relatedRecord?.[fieldInRelatedModel];
          return extractLocalizedString(relatedData, locale);
        }

        const maybeResult = exampleRecord?.[fieldName] as unknown;

        if (!maybeResult) {
          return "";
        }

        return extractLocalizedString(maybeResult, locale);
      },
    );
    return slugify(replacedString);
  }, [templateString, exampleRecord]);

  return (
    <Canvas ctx={ctx} noAutoResizer={false}>
      <Section title={"Template String"}>
        <span>
          Enter a filename template using {"{}"} for fields and space as
          separator. Do not include file type or extension.
        </span>
        <div className={s.container}>
          <MentionsInput
            value={templateString}
            onChange={handleTemplateStringChange}
            className={"templateField"}
            classNames={s}
            singleLine={true}
            placeholder={"e.g. {shopify_product_handle}-{fieldname}-othertext"}
          >
            <Mention
              className={s.mention}
              trigger="{"
              data={mentionableFields}
              markup={"{__display__}"}
              displayTransform={(_, display) => `{${display}}`}
            />
          </MentionsInput>
        </div>
        <div className={s.templateHint}>
          Example output:
          <br />
          {isLoading && (
            <span>
              {" "}
              <Spinner size={18} />
              Loading, please wait...
            </span>
          )}
          {!isLoading &&
            exampleString?.trim().length === 0 &&
            "(Template produces no visible text)"}
          {!isLoading && exampleString !== undefined && (
            <>
              <span className={s.example}>{exampleString}</span>
              -image-abcdef.jpg
            </>
          )}
          {!isLoading &&
            !templateString &&
            "(None yet. Enter a template first.)"}
        </div>
      </Section>

      <Section
        title="Debug"
        collapsible={{
          isOpen: isDebugOpen,
          onToggle: () => setIsDebugOpen((prev) => !prev),
        }}
      >
        <DebugTree data={{ exampleRecord }} />
        <DebugTree data={{ relatedRecords }} />
        <DebugTree data={{ mentionableFields }} />
        <DebugTree data={{ currentModelFields }} />
      </Section>
    </Canvas>
  );
};
