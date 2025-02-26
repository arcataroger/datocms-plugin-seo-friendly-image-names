import { Button, Canvas, Section, Spinner } from "datocms-react-ui";
import type { RenderFieldExtensionCtx } from "datocms-plugin-sdk";
import type { Upload } from "@datocms/cma-client/dist/types/generated/SimpleSchemaTypes";
import { useCallback, useEffect, useMemo, useState } from "react";
import s from "./styles.module.css";
import { cmaClient } from "../utils/cmaClient.ts";
import { extractLocalizedString } from "../utils/extractLocalizedString.ts";
import slugify from "@sindresorhus/slugify";
import { templateParsingRegex } from "../utils/utils.ts";
import type {
  AssetGalleryMetadata,
  ImageNeedingUpdate,
  PluginParams,
} from "../types/types.ts";

export const SEOFriendlyImageNames = ({
  ctx,
}: {
  ctx: RenderFieldExtensionCtx;
}) => {
  /** Basic setup **/
  // These are provided to us by the plugin SDK. They are passed from main.tsx.
  const {
    formValues,
    fieldPath,
    parameters,
    ui: { locale },
  } = ctx;

  const { templateString } = parameters as PluginParams;

  if (!templateString) {
    return (
      <Canvas ctx={ctx}>
        <p>No template string defined. Please configure in field settings.</p>
      </Canvas>
    );
  }

  const templateFields = useMemo<Map<string, string>>(() => {
    const templateMatches = templateString.matchAll(templateParsingRegex);
    let parsedFields = new Map<string, string>();
    for (const match of templateMatches) {
      const fieldName = match[1];

      const maybeMultiPartFieldName = fieldName.split(".");
      if (maybeMultiPartFieldName.length > 1) {
        try {
          (async () => {
            const fieldNameInThisModel = maybeMultiPartFieldName[0];
            const fieldNameInRelatedModel =
              maybeMultiPartFieldName[maybeMultiPartFieldName.length - 1];
            const relatedItemId = formValues[fieldNameInThisModel];
            if (relatedItemId && typeof relatedItemId == "string") {
              const relatedRecord = await cmaClient.items.find(relatedItemId);
              const relatedFieldData = relatedRecord[fieldNameInRelatedModel];
              const maybeRelatedString = extractLocalizedString(
                relatedFieldData,
                locale,
              );

              if (maybeRelatedString) {
                parsedFields.set(fieldName, maybeRelatedString);
              } else {
                parsedFields.set(fieldName, "");
              }
            }
          })();
        } catch (error) {
          parsedFields.set(fieldName, "");
          console.error("Error fetching related record data", error);
        }
      } else {
        const rawData = formValues[fieldName];
        const data = extractLocalizedString(rawData, locale);

        if (data) {
          parsedFields.set(fieldName, data);
        } else {
          parsedFields.set(fieldName, "");
        }
      }
    }

    return parsedFields;
  }, [templateString, formValues]);

  console.log("templateFields", templateFields);

  const generateCorrectImageBaseName = useCallback(
    ({
      imgMimeType,
      hash,
    }: {
      imgMimeType?: string;
      hash: string | number;
    }): string => {
      const mediaType: string = imgMimeType?.startsWith("video")
        ? "video"
        : "image";

      const replacedTemplateString = templateString.replace(
        templateParsingRegex,
        (_, fieldname) => templateFields.get(fieldname) ?? "",
      );

      console.log("replaced template", replacedTemplateString);

      return slugify(`${replacedTemplateString} ${mediaType} ${hash}`);
    },
    [templateString, templateFields],
  );

  // The asset gallery images (or technically, just their metadata)
  const galleryItems = formValues[fieldPath] as AssetGalleryMetadata[];

  const [images, setImages] = useState<Upload[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>();
  const [isSectionOpen, setIsSectionOpen] = useState<boolean>(false);

  /** Fetch needed data from the CMA and update our local state **/

  const fetchImageData = async () => {
    try {
      const ids = galleryItems.map((img) => img.upload_id);
      setIsLoading(true);
      setLoadingMessage("Refreshing image metadata...");
      const images = await cmaClient.uploads.list({
        filter: {
          ids: ids.join(),
        },
      });

      // But they come back out-of-order, so we have to manually sort them
      if (images) {
        let reorderedImages: Upload[] = [];
        images.forEach((img) => {
          const originalIndex = ids.indexOf(img.id);
          reorderedImages[originalIndex] = img;
        });
        setImages(reorderedImages);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        // Get existing image information
        if (galleryItems.length >= 1) {
          await fetchImageData();
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
        setLoadingMessage(null);
      }
    })();
  }, [galleryItems]);

  /** Identify images needing a basename update (basename is just the filename without extension, because that's what the CMA wants) **/

  // Calculate the correct slugified names
  const updatedImageNames = useMemo<string[]>(
    () =>
      images.map((img) =>
        generateCorrectImageBaseName({
          imgMimeType: img.mime_type ?? undefined,
          hash: img.md5.slice(0, 5), // We can use a shortened hash instead to better keep track of them
        }),
      ),
    [images, generateCorrectImageBaseName],
  );

  // Calculate which images still need the updated names
  const imagesNeedingUpdate = useMemo<ImageNeedingUpdate[]>(
    () =>
      images.flatMap((img, index) => {
        if (img.basename !== updatedImageNames[index]) {
          return [
            {
              id: img.id,
              currentBasename: img.basename,
              slugifiedBasename: updatedImageNames[index],
              ext:
                img.format ??
                img.filename.match(/\.([0-9a-z]+)(?:[?#]|$)/i)?.[1] ??
                "",
              thumbnailSrc: img.mime_type?.startsWith("image")
                ? `${img.url}?auto=compress&w=50&h=50&fit=crop`
                : videoIcon,
            },
          ];
        } else {
          return [];
        }
      }),
    [images, updatedImageNames],
  );

  const updateSingleFile = async ({
    id,
    newBasename,
  }: {
    id: string;
    newBasename: string;
  }) => {
    try {
      setIsLoading(true);
      setLoadingMessage(`Renaming image ${id} to ${newBasename}...`);
      const updatedImage = await cmaClient.uploads.update(id, {
        basename: newBasename,
      });

      // Double-check to make sure the image updated successfully
      if (updatedImage.basename === newBasename) {
        // Refresh our local image state to sync it with the gallery
        setImages((prevImages) =>
          prevImages.map((prevImg) =>
            prevImg.id === updatedImage.id ? updatedImage : prevImg,
          ),
        );
      } else {
        throw new Error(
          `Image ${id} basename mismatch even after update: ${updatedImage.basename} does not match ${newBasename}`,
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  };

  const handleSingleFileUpdate = async (id: string) => {
    const { slugifiedBasename, currentBasename, ext } =
      imagesNeedingUpdate.find((img) => img.id === id)!;

    const result = await ctx.openConfirm({
      title: `Rename ${currentBasename}.${ext}?`,
      content: `New name: ${slugifiedBasename}.${ext}`,
      choices: [
        {
          label: "Rename one file",
          value: true,
          intent: "positive",
        },
      ],
      cancel: {
        label: "Go back",
        value: false,
      },
    });

    if (result) {
      try {
        await updateSingleFile({
          id: id,
          newBasename: slugifiedBasename,
        });
        await ctx.notice(`Updated to ${slugifiedBasename}.${ext}`);
      } catch (error) {
        console.error(error);
        await ctx.alert(`Failed to update ${currentBasename}.${ext}: ${error}`);
      }
    }
  };

  const updateAllFilesInParallel = async () => {
    try {
      // Update all the names. DatoCMS limit is 60 every 3 seconds, so we don't need to worry about it.
      await Promise.all(
        imagesNeedingUpdate.map(async (img) => {
          await cmaClient.uploads.update(img.id, {
            basename: img.slugifiedBasename,
          });
        }),
      );

      // Refresh our local images state, just to make sure the updates all went through
      await fetchImageData();
    } catch (error) {
      console.error(error);
    }
  };

  const handleUpdateAllFiles = async () => {
    const result = await ctx.openConfirm({
      title: `Rename ${imagesNeedingUpdate.length} files?`,
      content: `The update will happen in the background and might take 5-10 seconds.`,
      choices: [
        {
          label: `Rename all ${imagesNeedingUpdate.length} files`,
          value: true,
          intent: "positive",
        },
      ],
      cancel: {
        label: "Go back",
        value: false,
      },
    });

    if (result) {
      setIsLoading(true);
      setLoadingMessage(`Updating ${imagesNeedingUpdate.length} names...`);
      try {
        await ctx.notice(`Updating ${imagesNeedingUpdate.length} files...`);
        await updateAllFilesInParallel();
        await ctx.notice(
          `Successfully updated ${imagesNeedingUpdate.length} files`,
        );
      } catch (error) {
        console.error(error);
        await ctx.alert(`Bulk update failed: ${error}`);
      } finally {
        setIsLoading(false);
        setLoadingMessage(null);
      }
    }
  };

  return (
    <Canvas ctx={ctx}>
      <Section
        title={
          <span onClick={() => setIsSectionOpen((prev) => !prev)}>
            {imagesNeedingUpdate.length ? "⚠️" : "✅"} Asset Stack SEO Plugin:{" "}
            {imagesNeedingUpdate.length >= 1
              ? `${imagesNeedingUpdate.length} update(s) needed`
              : "All good!"}
          </span>
        }
        headerClassName={s.clickableSection}
        collapsible={{
          isOpen: isSectionOpen,
          onToggle: () => setIsSectionOpen((prev) => !prev),
        }}
      >
        <div
          style={{
            border: "1px solid var(--primary-color)",
            padding: "0 30px 10px 30px",
            backgroundColor: "var(--light-color)",
          }}
        >
          <p>
            <a
              href={"#"}
              onClick={() => {
                fetchImageData();
              }}
            >
              Refresh list
            </a>
          </p>

          {isLoading && (
            <div>
              <Spinner size={24} />{" "}
              <span>{loadingMessage ?? "Loading, please wait..."}</span>
            </div>
          )}

          {!isLoading && imagesNeedingUpdate.length >= 1 && (
            <>
              <h2>
                {imagesNeedingUpdate.length} image(s) need a SEO-friendly
                filename (out of {galleryItems.length} total):
              </h2>
              {imagesNeedingUpdate.map((img) => (
                <div
                  key={img.id}
                  style={{ display: "flex", marginBottom: "1.5em" }}
                >
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <a
                      href={"#"}
                      onClick={async () => {
                        const editResult = await ctx.editUpload(img.id);
                        if (editResult) {
                          await fetchImageData(); // So the plugin sees the updates
                        }
                      }}
                    >
                      <img
                        src={img.thumbnailSrc}
                        alt={img.currentBasename}
                        style={{
                          border: "2px solid var(--accent-color)",
                          width: 50,
                          height: 50,
                        }}
                        title={img.currentBasename}
                      />
                    </a>
                  </div>
                  <div style={{ display: "flex" }}>
                    <ul
                      style={{ paddingLeft: 10, margin: 0, listStyle: "none" }}
                    >
                      <li>
                        Currently:{" "}
                        <strong>
                          {img.currentBasename}.{img.ext}
                        </strong>
                      </li>

                      <li>
                        Should be "{img.slugifiedBasename}.{img.ext}".{" "}
                        <a
                          href={"#"}
                          onClick={() => handleSingleFileUpdate(img.id)}
                        >
                          Update
                        </a>
                        ?
                      </li>
                    </ul>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                buttonSize="l"
                onClick={() => handleUpdateAllFiles()}
                buttonType="primary"
              >
                Update All ({imagesNeedingUpdate.length})
              </Button>
            </>
          )}

          {!isLoading && !imagesNeedingUpdate.length && (
            <div style={{ fontSize: 18 }}>
              <p>
                Everything looks good! You don't need any filename updates right
                now.
              </p>
            </div>
          )}
        </div>
      </Section>
    </Canvas>
  );
};

const videoIcon =
  "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBMaWNlbnNlOiBQRC4gTWFkZSBieSBzdGVwaGVuaHV0Y2hpbmdzOiBodHRwczovL2dpdGh1Yi5jb20vc3RlcGhlbmh1dGNoaW5ncy9taWNyb25zIC0tPgo8c3ZnIGZpbGw9IiMwMDAwMDAiIHdpZHRoPSI1MHB4IiBoZWlnaHQ9IjUwcHgiIHZpZXdCb3g9IjAgLTggNTI4IDUyOCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiA+PHRpdGxlPnZpZGVvPC90aXRsZT48cGF0aCBkPSJNMjY0IDQ1NlEyMTEgNDU2IDE2NCA0MjkgMTE4IDQwMiA5MSAzNTYgNjQgMzEwIDY0IDI1NiA2NCAyMDIgOTEgMTU2IDExOCAxMTAgMTY0IDgzIDIxMCA1NiAyNjQgNTYgMzE4IDU2IDM2NCA4MyA0MTAgMTEwIDQzNyAxNTYgNDY0IDIwMiA0NjQgMjU2IDQ2NCAzMDkgNDM3IDM1NiA0MTAgNDAyIDM2NCA0MjkgMzE4IDQ1NiAyNjQgNDU2Wk0zNDUgMjU2TDIxNiAxNjAgMjE2IDM1MiAzNDUgMjU2WiIgLz48L3N2Zz4=";
