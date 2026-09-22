console.log("Auto Listing AI background loaded");


chrome.runtime.onInstalled.addListener(() => {

  console.log(
    "Auto Listing AI installed"
  );

});


chrome.action.onClicked.addListener(
  async (tab) => {

    if (!tab.id) return;

    try {

      await chrome.sidePanel.open({
        tabId: tab.id
      });

    } catch (error) {

      console.error(
        "Side panel error:",
        error
      );

    }

  }
);


/*
=========================================
SIDE PANEL → CONTENT SCRIPT
=========================================
*/

chrome.runtime.onMessage.addListener(
  async (message, sender, sendResponse) => {

    if (
      message.type ===
      "FORWARD_TO_PAGE"
    ) {

      const tabId =
        message.tabId;


      if (!tabId) {

        sendResponse({
          success: false,
          error: "No tab ID"
        });

        return;
      }


      try {

        const response =
          await chrome.tabs.sendMessage(
            tabId,
            message.payload
          );


        sendResponse({
          success: true,
          response
        });


      } catch (error) {

        console.error(
          "Could not reach content script:",
          error
        );


        sendResponse({
          success: false,
          error: String(error)
        });

      }


      return true;
    }

  }
);