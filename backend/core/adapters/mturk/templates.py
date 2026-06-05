from xml.sax.saxutils import escape


def external_question_xml(url: str, frame_height: int = 900) -> str:
    """Build MTurk ExternalQuestion XML for hosted UIs."""
    safe = escape(url, {'"': "&quot;"})
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<ExternalQuestion xmlns="http://mechanicalturk.amazonaws.com/AWSMechanicalTurkDataSchemas/2006-07-14/ExternalQuestion.xsd">
  <ExternalURL>{safe}</ExternalURL>
  <FrameHeight>{frame_height}</FrameHeight>
</ExternalQuestion>"""
